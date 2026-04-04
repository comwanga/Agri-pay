use crate::error::{AppError, AppResult};
use crate::events;
use crate::state::SharedState;
use axum::{body::Bytes, extract::State, http::HeaderMap, response::IntoResponse, Json};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use sqlx::FromRow;
use subtle::ConstantTimeEq;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// Verify the `BTCPay-Sig` header against the raw request body.
/// Returns false on any error so the caller can safely return 401.
pub fn verify_btcpay_signature(secret: &str, body: &[u8], sig_header: &str) -> bool {
    let hex_sig = match sig_header.strip_prefix("sha256=") {
        Some(h) => h,
        None => return false,
    };
    let expected = match hex::decode(hex_sig) {
        Ok(b) => b,
        Err(_) => return false,
    };
    // Fix-8: use let-else instead of expect() — HMAC::new_from_slice only errors
    // on zero-length keys with some implementations; guard it anyway.
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    let computed = mac.finalize().into_bytes();
    bool::from(computed.as_slice().ct_eq(&expected))
}

#[derive(Debug, Deserialize)]
pub struct BtcPayWebhookPayload {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(rename = "invoiceId")]
    pub invoice_id: Option<String>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Serialize)]
struct WebhookAck {
    ok: bool,
}

#[derive(FromRow)]
struct PaymentLookup {
    id: Uuid,
    farmer_id: Uuid,
    amount_sats: i64,
}

/// POST /api/webhooks/btcpay
pub async fn handle_btcpay_webhook(
    State(state): State<SharedState>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<impl IntoResponse> {
    let sig_header = headers
        .get("BTCPay-Sig")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !verify_btcpay_signature(&state.config.btcpay_webhook_secret, &body, sig_header) {
        tracing::warn!("BTCPay webhook signature verification failed");
        return Err(AppError::Unauthorized("Invalid webhook signature".into()));
    }

    let payload: BtcPayWebhookPayload = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid webhook body: {}", e)))?;

    tracing::info!(
        event_type = %payload.event_type,
        invoice_id = ?payload.invoice_id,
        "BTCPay webhook received"
    );

    if payload.event_type == "InvoiceSettled" {
        let invoice_id = payload.invoice_id.as_deref().unwrap_or("").to_string();
        if invoice_id.is_empty() {
            return Err(AppError::BadRequest("Missing invoiceId in webhook".into()));
        }
        process_invoice_settled(&state, &invoice_id, &payload.extra).await?;
    }

    Ok(Json(WebhookAck { ok: true }))
}

async fn process_invoice_settled(
    state: &SharedState,
    btcpay_invoice_id: &str,
    extra: &Value,
) -> AppResult<()> {
    // Fetch the payment row — we need farmer_id and amount_sats for the balance credit.
    let payment: Option<PaymentLookup> = sqlx::query_as(
        "SELECT id, farmer_id, amount_sats FROM payments WHERE btcpay_invoice_id = $1",
    )
    .bind(btcpay_invoice_id)
    .fetch_optional(&state.db)
    .await?;

    let payment = match payment {
        Some(p) => p,
        None => {
            tracing::warn!(btcpay_invoice_id, "No payment found for BTCPay invoice");
            return Ok(());
        }
    };

    let payment_id = payment.id;
    let farmer_id = payment.farmer_id;
    let amount_sats = payment.amount_sats;

    let mut tx = state.db.begin().await?;

    // Fix-1 (CRITICAL): The status condition is now INSIDE the transaction.
    // If two concurrent webhooks race, only one will find a row to update
    // (the other sees 0 rows_affected and exits without touching the balance).
    let rows = sqlx::query(
        "UPDATE payments SET status = 'bitcoin_received'
         WHERE id = $1 AND status IN ('created', 'invoice_created')",
    )
    .bind(payment_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if rows == 0 {
        // Another concurrent webhook already processed this — safe to ignore.
        tx.rollback().await.ok();
        tracing::info!(%payment_id, "BTCPay webhook: payment already processed, skipping");
        return Ok(());
    }

    // Credit farmer balance atomically with the payment status advance.
    sqlx::query(
        r#"INSERT INTO balances (farmer_id, available_sats, locked_sats)
           VALUES ($1, $2, 0)
           ON CONFLICT (farmer_id)
           DO UPDATE SET available_sats = balances.available_sats + $2"#,
    )
    .bind(farmer_id)
    .bind(amount_sats)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE payments SET status = 'credited_to_farmer' WHERE id = $1")
        .bind(payment_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // Event recording is non-fatal.
    events::record_event(&state.db, payment_id, "bitcoin_received", extra.clone())
        .await
        .ok();
    events::record_event(
        &state.db,
        payment_id,
        "credited_to_farmer",
        serde_json::json!({ "amount_sats": amount_sats }),
    )
    .await
    .ok();

    tracing::info!(
        %payment_id,
        %farmer_id,
        amount_sats,
        "Payment credited to farmer balance"
    );

    Ok(())
}
