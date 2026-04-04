use crate::auth::jwt::{Claims, Role};
use crate::btcpay::BtcPayClient;
use crate::error::{AppError, AppResult};
use crate::events;
use crate::state::SharedState;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use super::{Payment, PaymentWithFarmer};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_NOTES_LEN: usize = 500;
const MAX_CROP_TYPE_LEN: usize = 100;

// ── Request / Response types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreatePaymentRequest {
    pub farmer_id: Uuid,
    pub amount_kes: Decimal,
    pub crop_type: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreatePaymentResponse {
    pub payment: Payment,
    pub btcpay_payment_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListPaymentsQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub farmer_id: Option<Uuid>,
    pub status: Option<String>,
}

// ── DB row types ──────────────────────────────────────────────────────────────

#[derive(FromRow)]
struct PaymentRow {
    id: Uuid,
    farmer_id: Uuid,
    btcpay_invoice_id: Option<String>,
    btcpay_payment_url: Option<String>,
    amount_sats: i64,
    amount_kes: Decimal,
    rate_used: Decimal,
    status: String,
    failure_reason: Option<String>,
    crop_type: Option<String>,
    notes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(FromRow)]
struct PaymentWithFarmerRow {
    id: Uuid,
    farmer_id: Uuid,
    btcpay_invoice_id: Option<String>,
    btcpay_payment_url: Option<String>,
    amount_sats: i64,
    amount_kes: Decimal,
    rate_used: Decimal,
    status: String,
    failure_reason: Option<String>,
    crop_type: Option<String>,
    notes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    farmer_name: String,
    farmer_phone: String,
}

impl From<PaymentRow> for Payment {
    fn from(r: PaymentRow) -> Self {
        Payment {
            id: r.id,
            farmer_id: r.farmer_id,
            btcpay_invoice_id: r.btcpay_invoice_id,
            btcpay_payment_url: r.btcpay_payment_url,
            amount_sats: r.amount_sats,
            amount_kes: r.amount_kes,
            rate_used: r.rate_used,
            status: r.status,
            failure_reason: r.failure_reason,
            crop_type: r.crop_type,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

impl From<PaymentWithFarmerRow> for PaymentWithFarmer {
    fn from(r: PaymentWithFarmerRow) -> Self {
        PaymentWithFarmer {
            payment: Payment {
                id: r.id,
                farmer_id: r.farmer_id,
                btcpay_invoice_id: r.btcpay_invoice_id,
                btcpay_payment_url: r.btcpay_payment_url,
                amount_sats: r.amount_sats,
                amount_kes: r.amount_kes,
                rate_used: r.rate_used,
                status: r.status,
                failure_reason: r.failure_reason,
                crop_type: r.crop_type,
                notes: r.notes,
                created_at: r.created_at,
                updated_at: r.updated_at,
            },
            farmer_name: r.farmer_name,
            farmer_phone: r.farmer_phone,
        }
    }
}

const PAYMENT_WITH_FARMER_SELECT: &str = r#"
    SELECT p.id, p.farmer_id, p.btcpay_invoice_id, p.btcpay_payment_url,
           p.amount_sats, p.amount_kes, p.rate_used, p.status,
           p.failure_reason, p.crop_type, p.notes, p.created_at, p.updated_at,
           f.name AS farmer_name, f.phone AS farmer_phone
    FROM payments p
    JOIN farmers f ON f.id = p.farmer_id
"#;

// ── Handlers ──────────────────────────────────────────────────────────────────

/// POST /api/payments
pub async fn create_payment(
    State(state): State<SharedState>,
    claims: Claims,
    Json(body): Json<CreatePaymentRequest>,
) -> AppResult<Json<CreatePaymentResponse>> {
    match claims.role {
        Role::Admin | Role::Operator => {}
        _ => return Err(AppError::Forbidden("Admin or operator required".into())),
    }

    // S8: enforce field length limits
    if let Some(ref ct) = body.crop_type {
        if ct.len() > MAX_CROP_TYPE_LEN {
            return Err(AppError::BadRequest(format!(
                "crop_type exceeds maximum length of {} characters",
                MAX_CROP_TYPE_LEN
            )));
        }
    }
    if let Some(ref notes) = body.notes {
        if notes.len() > MAX_NOTES_LEN {
            return Err(AppError::BadRequest(format!(
                "notes exceeds maximum length of {} characters",
                MAX_NOTES_LEN
            )));
        }
    }

    // Verify farmer exists
    #[derive(FromRow)]
    struct FarmerCheck {
        #[allow(dead_code)]
        id: Uuid,
    }
    let exists: Option<FarmerCheck> = sqlx::query_as("SELECT id FROM farmers WHERE id = $1")
        .bind(body.farmer_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!(
            "Farmer {} not found",
            body.farmer_id
        )));
    }

    if body.amount_kes <= Decimal::ZERO {
        return Err(AppError::BadRequest("amount_kes must be positive".into()));
    }

    let btc_kes_rate = get_or_fetch_rate(&state).await?;

    let sats_per_kes = Decimal::new(100_000_000, 0) / btc_kes_rate;
    let amount_sats = (body.amount_kes * sats_per_kes)
        .round()
        .to_string()
        .parse::<i64>()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("sats conversion: {}", e)))?;

    if amount_sats < 1000 {
        return Err(AppError::BadRequest(
            "Minimum payment is 1000 satoshis".into(),
        ));
    }

    let payment_id: Uuid = sqlx::query_scalar(
        "INSERT INTO payments (farmer_id, amount_sats, amount_kes, rate_used, status, crop_type, notes)
         VALUES ($1, $2, $3, $4, 'created', $5, $6)
         RETURNING id",
    )
    .bind(body.farmer_id)
    .bind(amount_sats)
    .bind(body.amount_kes)
    .bind(btc_kes_rate)
    .bind(&body.crop_type)
    .bind(&body.notes)
    .fetch_one(&state.db)
    .await?;

    // Create BTCPay invoice
    let btcpay = BtcPayClient::new(&state.config, state.http.clone());
    let description = format!(
        "Agri-Pay crop payment - {}",
        body.crop_type.as_deref().unwrap_or("General")
    );

    let invoice_result = btcpay
        .create_invoice(amount_sats, &description, Some(&payment_id.to_string()), None)
        .await;

    let (status, btcpay_invoice_id, btcpay_payment_url, failure_reason) = match invoice_result {
        Ok(inv) => (
            "invoice_created",
            Some(inv.id),
            Some(inv.checkout_link),
            None::<String>,
        ),
        Err(e) => {
            tracing::error!("Failed to create BTCPay invoice: {}", e);
            (
                "failed",
                None::<String>,
                None::<String>,
                Some(format!("BTCPay error: {}", e)),
            )
        }
    };

    sqlx::query(
        "UPDATE payments SET status=$2, btcpay_invoice_id=$3, btcpay_payment_url=$4, failure_reason=$5 WHERE id=$1",
    )
    .bind(payment_id)
    .bind(status)
    .bind(&btcpay_invoice_id)
    .bind(&btcpay_payment_url)
    .bind(&failure_reason)
    .execute(&state.db)
    .await?;

    let row: PaymentRow = sqlx::query_as(
        "SELECT id, farmer_id, btcpay_invoice_id, btcpay_payment_url,
                amount_sats, amount_kes, rate_used, status, failure_reason,
                crop_type, notes, created_at, updated_at
         FROM payments WHERE id = $1",
    )
    .bind(payment_id)
    .fetch_one(&state.db)
    .await?;

    let url = row.btcpay_payment_url.clone();
    let payment: Payment = row.into();

    events::record_event(
        &state.db,
        payment_id,
        "invoice_created",
        serde_json::json!({ "btcpay_invoice_id": btcpay_invoice_id, "amount_sats": amount_sats }),
    )
    .await
    .ok();

    Ok(Json(CreatePaymentResponse {
        payment,
        btcpay_payment_url: url,
    }))
}

/// GET /api/payments
pub async fn list_payments(
    State(state): State<SharedState>,
    claims: Claims,
    Query(q): Query<ListPaymentsQuery>,
) -> AppResult<Json<Vec<PaymentWithFarmer>>> {
    match claims.role {
        Role::Admin | Role::Operator => {}
        _ => return Err(AppError::Forbidden("Admin or operator required".into())),
    }

    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * per_page;

    let rows: Vec<PaymentWithFarmerRow> = if let Some(fid) = q.farmer_id {
        if let Some(ref status) = q.status {
            sqlx::query_as(&format!(
                "{} WHERE p.farmer_id = $1 AND p.status = $2 ORDER BY p.created_at DESC LIMIT $3 OFFSET $4",
                PAYMENT_WITH_FARMER_SELECT
            ))
            .bind(fid)
            .bind(status)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        } else {
            sqlx::query_as(&format!(
                "{} WHERE p.farmer_id = $1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3",
                PAYMENT_WITH_FARMER_SELECT
            ))
            .bind(fid)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
    } else if let Some(ref status) = q.status {
        sqlx::query_as(&format!(
            "{} WHERE p.status = $1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3",
            PAYMENT_WITH_FARMER_SELECT
        ))
        .bind(status)
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(&format!(
            "{} ORDER BY p.created_at DESC LIMIT $1 OFFSET $2",
            PAYMENT_WITH_FARMER_SELECT
        ))
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// GET /api/payments/:id
pub async fn get_payment(
    State(state): State<SharedState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PaymentWithFarmer>> {
    let row: Option<PaymentWithFarmerRow> =
        sqlx::query_as(&format!("{} WHERE p.id = $1", PAYMENT_WITH_FARMER_SELECT))
            .bind(id)
            .fetch_optional(&state.db)
            .await?;

    let row = row.ok_or_else(|| AppError::NotFound(format!("Payment {} not found", id)))?;

    if claims.role == Role::Farmer && claims.farmer_id != Some(row.farmer_id) {
        return Err(AppError::Forbidden("Access denied".into()));
    }

    Ok(Json(row.into()))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Fetch BTC/KES rate from cache (if fresh) or live oracle.
/// Fix-6: apply round_dp(4) after f64→Decimal to eliminate representation noise.
async fn get_or_fetch_rate(state: &SharedState) -> AppResult<Decimal> {
    #[derive(FromRow)]
    struct RateCacheEntry {
        btc_kes: Decimal,
        fetched_at: DateTime<Utc>,
    }

    let row: Option<RateCacheEntry> = sqlx::query_as(
        "SELECT btc_kes, fetched_at FROM rate_cache ORDER BY fetched_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(r) = row {
        let age = Utc::now()
            .signed_duration_since(r.fetched_at)
            .num_seconds() as u64;
        if age <= state.config.max_rate_stale_secs {
            return Ok(r.btc_kes);
        }
    }

    let rate = state
        .oracle
        .fetch_rate()
        .await
        .map_err(|e| AppError::Oracle(e.to_string()))?;

    // Fix-6: round to 4 dp after f64→Decimal conversion.
    let btc_kes = Decimal::try_from(rate.btc_kes)
        .map(|d| d.round_dp(4))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("rate conversion: {}", e)))?;
    let btc_usd = Decimal::try_from(rate.btc_usd)
        .map(|d| d.round_dp(4))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("rate conversion: {}", e)))?;

    sqlx::query("INSERT INTO rate_cache (btc_kes, btc_usd) VALUES ($1, $2)")
        .bind(btc_kes)
        .bind(btc_usd)
        .execute(&state.db)
        .await?;

    Ok(btc_kes)
}
