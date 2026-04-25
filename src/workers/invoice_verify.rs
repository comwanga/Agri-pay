//! LUD-21 verify-URL polling worker.
//!
//! When a seller's LNURL endpoint returns a `verify` field (LUD-21), it means
//! we can poll that URL to discover if the invoice was paid — without needing
//! BTCPay webhooks or asking the buyer to paste a preimage.
//!
//! Settlement proof comes from the wallet itself: `{ "settled": true, "preimage": "..." }`.
//! We validate the preimage (must be 32 raw bytes, hex-encoded) and store
//! `sha256(preimage)` as the cryptographic payment hash.
//!
//! Supported wallets: Alby, LNbits, Coinos, Blink, Wallet of Satoshi, and
//! any wallet that implements LUD-21.

use chrono::Utc;
use reqwest::Client;
use sha2::Digest;
use sqlx::PgPool;
use std::time::Duration;
use uuid::Uuid;

const POLL_INTERVAL_SECS: u64 = 10;
const VERIFY_TIMEOUT_SECS: u64 = 5;
const MAX_BATCH: i64 = 50;

#[derive(serde::Deserialize)]
struct VerifyResponse {
    settled: bool,
    preimage: Option<String>,
}

/// Run forever, polling pending invoices that carry a LUD-21 verify URL.
/// Errors within a tick are logged and swallowed — the worker never crashes.
pub async fn run(pool: PgPool, http: Client) {
    tracing::info!(
        interval_secs = POLL_INTERVAL_SECS,
        "LUD-21 invoice verify worker started"
    );

    loop {
        tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
        if let Err(e) = tick(&pool, &http).await {
            tracing::warn!(error = %e, "Invoice verify worker tick error");
        }
    }
}

async fn tick(pool: &PgPool, http: &Client) -> anyhow::Result<()> {
    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        order_id: Uuid,
        verify_url: String,
    }

    // Only check invoices that are still within their validity window.
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT id, order_id, verify_url
         FROM payments
         WHERE status     = 'pending'
           AND verify_url IS NOT NULL
           AND expires_at > NOW()
         ORDER BY created_at
         LIMIT $1",
    )
    .bind(MAX_BATCH)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    tracing::debug!(
        count = rows.len(),
        "Polling LUD-21 verify URLs for pending invoices"
    );

    for row in rows {
        match query_verify_url(http, &row.verify_url).await {
            Ok(Some(preimage)) => {
                if let Err(e) = settle(pool, row.id, row.order_id, &preimage).await {
                    tracing::error!(
                        payment_id = %row.id,
                        error = %e,
                        "Failed to settle verified payment"
                    );
                }
            }
            Ok(None) => {}
            Err(e) => {
                tracing::debug!(
                    payment_id = %row.id,
                    verify_url = %row.verify_url,
                    error = %e,
                    "Verify URL check failed (will retry next tick)"
                );
            }
        }
    }

    Ok(())
}

/// GET the verify URL and return the preimage if the invoice is settled.
async fn query_verify_url(http: &Client, url: &str) -> anyhow::Result<Option<String>> {
    let resp = http
        .get(url)
        .timeout(Duration::from_secs(VERIFY_TIMEOUT_SECS))
        .send()
        .await?;

    if !resp.status().is_success() {
        anyhow::bail!("Verify URL returned HTTP {}", resp.status());
    }

    let body: VerifyResponse = resp.json().await?;

    if body.settled {
        Ok(body.preimage)
    } else {
        Ok(None)
    }
}

/// Atomically settle the payment and advance the order.
async fn settle(
    pool: &PgPool,
    payment_id: Uuid,
    order_id: Uuid,
    raw_preimage: &str,
) -> anyhow::Result<()> {
    let preimage = raw_preimage.trim().to_lowercase();

    // Validate: must be 64 hex chars (32 bytes)
    let preimage_bytes = hex::decode(&preimage)
        .map_err(|e| anyhow::anyhow!("Invalid preimage from verify URL (not hex): {}", e))?;
    if preimage_bytes.len() != 32 {
        anyhow::bail!(
            "Invalid preimage length from verify URL: {} bytes (expected 32)",
            preimage_bytes.len()
        );
    }

    let payment_hash = hex::encode(sha2::Sha256::digest(&preimage_bytes));
    let now = Utc::now();

    // Mark payment settled (idempotent: WHERE guards against double-settle)
    let result = sqlx::query(
        "UPDATE payments
         SET status       = 'settled',
             preimage     = $2,
             payment_hash = $3,
             settled_at   = $4
         WHERE id = $1 AND status = 'pending'",
    )
    .bind(payment_id)
    .bind(&preimage)
    .bind(&payment_hash)
    .bind(now)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        // Already settled by another path (WebLN, manual paste, concurrent worker)
        return Ok(());
    }

    // Advance order to paid (idempotent)
    sqlx::query(
        "UPDATE orders
         SET status     = 'paid',
             updated_at = NOW()
         WHERE id = $1 AND status = 'pending_payment'",
    )
    .bind(order_id)
    .execute(pool)
    .await?;

    // Audit trail (non-critical — log but don't fail the settle)
    let _ = sqlx::query(
        "INSERT INTO order_events (order_id, actor_id, event_type, metadata, created_at)
         VALUES ($1, NULL, 'paid', $2, NOW())",
    )
    .bind(order_id)
    .bind(serde_json::json!({
        "source":     "lnurl_verify_worker",
        "payment_id": payment_id,
    }))
    .execute(pool)
    .await
    .map_err(|e| tracing::warn!(order_id = %order_id, error = %e, "Failed to write audit event"));

    tracing::info!(
        payment_id = %payment_id,
        order_id   = %order_id,
        "Order auto-advanced to paid via LUD-21 verify URL"
    );

    Ok(())
}
