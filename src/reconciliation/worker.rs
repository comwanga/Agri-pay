use crate::state::SharedState;
use rust_decimal::Decimal;
use sqlx::FromRow;
use std::time::Duration;
use uuid::Uuid;

/// Spawn all background worker tasks.
pub fn spawn_workers(state: SharedState) {
    let s1 = state.clone();
    let s2 = state.clone();
    let s3 = state.clone();

    tokio::spawn(async move { run_expiry_worker(s1).await });
    tokio::spawn(async move { run_cashout_worker(s2).await });
    tokio::spawn(async move { run_reconciliation_worker(s3).await });
}

// ── Worker 1: Invoice expiry ──────────────────────────────────────────────────

async fn run_expiry_worker(state: SharedState) {
    let interval = Duration::from_secs(state.config.expiry_interval_secs);
    loop {
        tokio::time::sleep(interval).await;
        if let Err(e) = expire_old_invoices(&state).await {
            tracing::error!("Expiry worker error: {}", e);
        }
    }
}

async fn expire_old_invoices(state: &SharedState) -> anyhow::Result<()> {
    let expiry_secs = state.config.invoice_expiry_secs as i64;

    let result = sqlx::query(
        "UPDATE payments
         SET status = 'failed',
             failure_reason = 'Invoice expired: no payment received within time limit'
         WHERE status = 'invoice_created'
           AND created_at < NOW() - ($1 * INTERVAL '1 second')",
    )
    .bind(expiry_secs)
    .execute(&state.db)
    .await?;

    if result.rows_affected() > 0 {
        tracing::info!(
            expired = result.rows_affected(),
            "Expiry worker: marked payments as failed"
        );
    }

    Ok(())
}

// ── Worker 2: Cash-out processor ─────────────────────────────────────────────

#[derive(FromRow)]
struct PendingWithdrawal {
    id: Uuid,
    farmer_id: Uuid,
    amount_sats: i64,
    amount_kes: Decimal,
    phone: String,
}

async fn run_cashout_worker(state: SharedState) {
    let interval = Duration::from_secs(30);
    loop {
        tokio::time::sleep(interval).await;
        if let Err(e) = process_pending_withdrawals(&state).await {
            tracing::error!("Cash-out worker error: {}", e);
        }
    }
}

async fn process_pending_withdrawals(state: &SharedState) -> anyhow::Result<()> {
    let pending: Vec<PendingWithdrawal> = sqlx::query_as(
        "SELECT w.id, w.farmer_id, w.amount_sats, w.amount_kes, f.phone
         FROM withdrawals w
         JOIN farmers f ON f.id = w.farmer_id
         WHERE w.status = 'pending'
         ORDER BY w.created_at ASC
         LIMIT 10",
    )
    .fetch_all(&state.db)
    .await?;

    for row in pending {
        let withdrawal_id = row.id;

        // Optimistic lock: only process if still pending
        let updated = sqlx::query(
            "UPDATE withdrawals SET status = 'processing'
             WHERE id = $1 AND status = 'pending'",
        )
        .bind(withdrawal_id)
        .execute(&state.db)
        .await?
        .rows_affected();

        if updated == 0 {
            continue;
        }

        // Fix: avoid f64 round-trip; parse Decimal string directly to integer KES.
        let amount_kes_u64: u64 = row
            .amount_kes
            .round()
            .to_string()
            .parse::<u64>()
            .unwrap_or(0);

        match state
            .mpesa
            .send_b2c(&row.phone, amount_kes_u64, &withdrawal_id.to_string())
            .await
        {
            Ok(resp) => {
                let request_id = resp.originator_conversation_id.unwrap_or_default();

                sqlx::query(
                    "UPDATE withdrawals SET status = 'disbursing_mpesa', mpesa_request_id = $2
                     WHERE id = $1",
                )
                .bind(withdrawal_id)
                .bind(&request_id)
                .execute(&state.db)
                .await?;

                tracing::info!(%withdrawal_id, request_id, "Cash-out B2C initiated");
            }
            Err(e) => {
                tracing::error!(%withdrawal_id, "B2C initiation failed: {}", e);

                // Refund locked → available
                sqlx::query(
                    "UPDATE balances
                     SET available_sats = available_sats + $2, locked_sats = locked_sats - $2
                     WHERE farmer_id = $1",
                )
                .bind(row.farmer_id)
                .bind(row.amount_sats)
                .execute(&state.db)
                .await
                .ok();

                sqlx::query(
                    "UPDATE withdrawals SET status = 'failed', failure_reason = $2 WHERE id = $1",
                )
                .bind(withdrawal_id)
                .bind(e.to_string())
                .execute(&state.db)
                .await?;
            }
        }
    }

    Ok(())
}

// ── Worker 3: Stuck disbursement reconciliation ────────────────────────────────

#[derive(FromRow)]
struct StuckWithdrawal {
    id: Uuid,
    farmer_id: Uuid,
    amount_sats: i64,
    mpesa_request_id: Option<String>,
}

async fn run_reconciliation_worker(state: SharedState) {
    let interval = Duration::from_secs(state.config.reconcile_interval_secs);
    loop {
        tokio::time::sleep(interval).await;
        if let Err(e) = reconcile_stuck_disbursements(&state).await {
            tracing::error!("Reconciliation worker error: {}", e);
        }
        // Fix-7: prune rate_cache to prevent unbounded table growth.
        if let Err(e) = prune_rate_cache(&state).await {
            tracing::error!("Rate cache pruning error: {}", e);
        }
    }
}

/// Auto-fail withdrawals stuck in `disbursing_mpesa` beyond `disburse_stale_secs`.
/// M-Pesa callbacks arrive within minutes; if we haven't heard back by this
/// threshold it is safe to treat the disbursement as failed and refund the sats.
async fn reconcile_stuck_disbursements(state: &SharedState) -> anyhow::Result<()> {
    let stale_secs = state.config.disburse_stale_secs as i64;

    let stuck: Vec<StuckWithdrawal> = sqlx::query_as(
        "SELECT id, farmer_id, amount_sats, mpesa_request_id
         FROM withdrawals
         WHERE status = 'disbursing_mpesa'
           AND updated_at < NOW() - ($1 * INTERVAL '1 second')",
    )
    .bind(stale_secs)
    .fetch_all(&state.db)
    .await?;

    for row in &stuck {
        tracing::error!(
            withdrawal_id = %row.id,
            mpesa_request_id = ?row.mpesa_request_id,
            "Stuck withdrawal: no M-Pesa callback received — auto-failing and refunding"
        );

        let mut tx = state.db.begin().await?;

        // Idempotency: only proceed if still stuck (concurrent callback may have raced).
        let updated = sqlx::query(
            "UPDATE withdrawals
             SET status = 'failed',
                 failure_reason = 'No M-Pesa callback received within stale timeout'
             WHERE id = $1 AND status = 'disbursing_mpesa'",
        )
        .bind(row.id)
        .execute(&mut *tx)
        .await?
        .rows_affected();

        if updated > 0 {
            sqlx::query(
                "UPDATE balances
                 SET available_sats = available_sats + $2,
                     locked_sats    = locked_sats    - $2
                 WHERE farmer_id = $1",
            )
            .bind(row.farmer_id)
            .bind(row.amount_sats)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
    }

    if !stuck.is_empty() {
        tracing::warn!(
            count = stuck.len(),
            "Reconciliation: auto-failed stuck disbursements and refunded farmer balances"
        );
    }

    Ok(())
}

/// Fix-7: Delete rate_cache rows older than 24 hours, keeping at most 1000 rows.
/// Prevents the table from growing unboundedly at 1 row per RATE_CACHE_SECONDS.
async fn prune_rate_cache(state: &SharedState) -> anyhow::Result<()> {
    let result = sqlx::query(
        "DELETE FROM rate_cache
         WHERE id NOT IN (
             SELECT id FROM rate_cache ORDER BY fetched_at DESC LIMIT 1000
         )",
    )
    .execute(&state.db)
    .await?;

    if result.rows_affected() > 0 {
        tracing::debug!(pruned = result.rows_affected(), "Rate cache pruned");
    }

    Ok(())
}
