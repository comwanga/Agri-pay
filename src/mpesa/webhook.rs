use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use serde_json::Value;
use sqlx::FromRow;
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(FromRow)]
struct WithdrawalLookup {
    farmer_id: Uuid,
    amount_sats: i64,
}

/// Constant-time comparison of the webhook secret.
/// Fix-5: prevents timing-oracle attacks on the secret token.
fn verify_webhook_secret(provided: &str, expected: &str) -> bool {
    bool::from(provided.as_bytes().ct_eq(expected.as_bytes()))
}

/// POST /api/webhooks/mpesa/:secret/result
pub async fn mpesa_result(
    State(state): State<SharedState>,
    Path(secret): Path<String>,
    Json(body): Json<Value>,
) -> AppResult<impl IntoResponse> {
    // Fix-5: constant-time comparison
    if !verify_webhook_secret(&secret, &state.config.webhook_secret) {
        tracing::warn!("M-Pesa result callback: invalid secret");
        return Err(AppError::Unauthorized("Invalid webhook secret".into()));
    }

    tracing::debug!("M-Pesa result callback received");

    let result = match body.get("Result") {
        Some(r) => r,
        None => return Ok(Json(serde_json::json!({ "ok": true }))),
    };

    let result_code = result
        .get("ResultCode")
        .and_then(|v| v.as_i64())
        .unwrap_or(-1);
    let originator_id = result
        .get("OriginatorConversationID")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let transaction_id = result
        .get("TransactionID")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let result_desc = result
        .get("ResultDesc")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if originator_id.is_empty() {
        tracing::warn!("M-Pesa result: missing OriginatorConversationID");
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    if result_code == 0 {
        // Fix-2 (HIGH): Fetch the withdrawal BEFORE opening the transaction so we
        // have farmer_id/amount_sats. Scoped to 'disbursing_mpesa' so a replay
        // returns None and is silently ignored (the balance update never runs).
        let w: Option<WithdrawalLookup> = sqlx::query_as(
            "SELECT farmer_id, amount_sats FROM withdrawals
             WHERE mpesa_request_id = $1 AND status = 'disbursing_mpesa'",
        )
        .bind(&originator_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some(w) = w {
            let mut tx = state.db.begin().await?;

            // Conditional update — safe if webhook replays (rows == 0 → skip balance).
            let rows = sqlx::query(
                "UPDATE withdrawals SET status = 'completed', mpesa_ref = $2
                 WHERE mpesa_request_id = $1 AND status = 'disbursing_mpesa'",
            )
            .bind(&originator_id)
            .bind(&transaction_id)
            .execute(&mut *tx)
            .await?
            .rows_affected();

            if rows > 0 {
                // Money left the system — decrement locked only (no available_sats restore).
                sqlx::query(
                    "UPDATE balances SET locked_sats = locked_sats - $2 WHERE farmer_id = $1",
                )
                .bind(w.farmer_id)
                .bind(w.amount_sats)
                .execute(&mut *tx)
                .await?;
            }

            tx.commit().await?;

            tracing::info!(
                originator_id,
                transaction_id,
                farmer_id = %w.farmer_id,
                amount_sats = w.amount_sats,
                "M-Pesa B2C completed successfully"
            );
        } else {
            tracing::info!(
                originator_id,
                "M-Pesa success callback: withdrawal already settled or not found"
            );
        }
    } else {
        // Fix-2 (HIGH): failure path — also scoped to 'disbursing_mpesa' to prevent
        // replay from double-refunding, and wrapped in a transaction.
        let w: Option<WithdrawalLookup> = sqlx::query_as(
            "SELECT farmer_id, amount_sats FROM withdrawals
             WHERE mpesa_request_id = $1 AND status = 'disbursing_mpesa'",
        )
        .bind(&originator_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some(w) = w {
            let mut tx = state.db.begin().await?;

            sqlx::query(
                "UPDATE withdrawals SET status = 'failed', failure_reason = $2
                 WHERE mpesa_request_id = $1 AND status = 'disbursing_mpesa'",
            )
            .bind(&originator_id)
            .bind(&result_desc)
            .execute(&mut *tx)
            .await?;

            // Refund locked → available
            sqlx::query(
                "UPDATE balances
                 SET available_sats = available_sats + $2,
                     locked_sats    = locked_sats    - $2
                 WHERE farmer_id = $1",
            )
            .bind(w.farmer_id)
            .bind(w.amount_sats)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            tracing::warn!(
                originator_id,
                result_code,
                result_desc,
                farmer_id = %w.farmer_id,
                amount_sats = w.amount_sats,
                "M-Pesa B2C failed — sats refunded to farmer"
            );
        } else {
            tracing::info!(originator_id, "M-Pesa failure callback: withdrawal not found or already settled");
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/webhooks/mpesa/:secret/timeout
pub async fn mpesa_timeout(
    State(state): State<SharedState>,
    Path(secret): Path<String>,
    Json(body): Json<Value>,
) -> AppResult<impl IntoResponse> {
    // Fix-5: constant-time comparison
    if !verify_webhook_secret(&secret, &state.config.webhook_secret) {
        return Err(AppError::Unauthorized("Invalid webhook secret".into()));
    }

    tracing::warn!("M-Pesa timeout callback received");

    if let Some(originator_id) = body
        .get("Result")
        .and_then(|r| r.get("OriginatorConversationID"))
        .and_then(|v| v.as_str())
    {
        // Scope lookup to 'disbursing_mpesa' — prevents replay refund.
        let w: Option<WithdrawalLookup> = sqlx::query_as(
            "SELECT farmer_id, amount_sats FROM withdrawals
             WHERE mpesa_request_id = $1 AND status = 'disbursing_mpesa'",
        )
        .bind(originator_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some(w) = w {
            let mut tx = state.db.begin().await?;

            sqlx::query(
                "UPDATE withdrawals SET status = 'failed', failure_reason = 'M-Pesa timeout'
                 WHERE mpesa_request_id = $1 AND status = 'disbursing_mpesa'",
            )
            .bind(originator_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "UPDATE balances
                 SET available_sats = available_sats + $2,
                     locked_sats    = locked_sats    - $2
                 WHERE farmer_id = $1",
            )
            .bind(w.farmer_id)
            .bind(w.amount_sats)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            tracing::warn!(
                originator_id,
                farmer_id = %w.farmer_id,
                amount_sats = w.amount_sats,
                "M-Pesa timeout: withdrawal failed and sats refunded"
            );
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
