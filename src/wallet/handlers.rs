use crate::auth::jwt::{Claims, Role};
use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct BalanceRow {
    pub farmer_id: Uuid,
    pub available_sats: i64,
    pub locked_sats: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct BalanceResponse {
    pub farmer_id: Uuid,
    pub available_sats: i64,
    pub locked_sats: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct WithdrawRequest {
    pub amount_kes: Decimal,
}

#[derive(Debug, Serialize)]
pub struct WithdrawResponse {
    pub withdrawal_id: Uuid,
    pub farmer_id: Uuid,
    pub amount_sats: i64,
    pub amount_kes: Decimal,
    pub status: String,
}

/// GET /api/wallet/balance
pub async fn get_balance(
    State(state): State<SharedState>,
    claims: Claims,
) -> AppResult<Json<BalanceResponse>> {
    if claims.role != Role::Farmer {
        return Err(AppError::Forbidden("Farmer role required".into()));
    }

    let farmer_id = claims
        .farmer_id
        .ok_or_else(|| AppError::Forbidden("Farmer role required".into()))?;

    let row: Option<BalanceRow> = sqlx::query_as(
        "SELECT farmer_id, available_sats, locked_sats, updated_at FROM balances WHERE farmer_id = $1",
    )
    .bind(farmer_id)
    .fetch_optional(&state.db)
    .await?;

    let resp = match row {
        Some(r) => BalanceResponse {
            farmer_id: r.farmer_id,
            available_sats: r.available_sats,
            locked_sats: r.locked_sats,
            updated_at: r.updated_at,
        },
        None => BalanceResponse {
            farmer_id,
            available_sats: 0,
            locked_sats: 0,
            updated_at: Utc::now(),
        },
    };

    Ok(Json(resp))
}

/// POST /api/wallet/withdraw
pub async fn request_withdrawal(
    State(state): State<SharedState>,
    claims: Claims,
    Json(body): Json<WithdrawRequest>,
) -> AppResult<Json<WithdrawResponse>> {
    if claims.role != Role::Farmer {
        return Err(AppError::Forbidden("Farmer role required".into()));
    }

    let farmer_id = claims
        .farmer_id
        .ok_or_else(|| AppError::Forbidden("Farmer role required".into()))?;

    if body.amount_kes <= Decimal::ZERO {
        return Err(AppError::BadRequest("amount_kes must be positive".into()));
    }

    // Fix-4 (HIGH): Apply the same staleness guard used for payment creation.
    // Using an arbitrarily old rate for a withdrawal is a financial risk.
    let btc_kes = get_rate_with_staleness_check(&state).await?;

    let sats_per_kes = Decimal::new(100_000_000, 0) / btc_kes;
    let amount_sats_decimal = body.amount_kes * sats_per_kes;
    let amount_sats = amount_sats_decimal
        .round()
        .to_string()
        .parse::<i64>()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("sats conversion: {}", e)))?;

    if amount_sats < 1000 {
        return Err(AppError::BadRequest(
            "Minimum withdrawal is 1000 satoshis".into(),
        ));
    }

    // Atomically lock funds and create withdrawal record.
    let mut tx = state.db.begin().await?;

    #[derive(FromRow)]
    struct BalanceLock {
        available_sats: i64,
    }
    let balance: Option<BalanceLock> = sqlx::query_as(
        "SELECT available_sats FROM balances WHERE farmer_id = $1 FOR UPDATE",
    )
    .bind(farmer_id)
    .fetch_optional(&mut *tx)
    .await?;

    let available = balance.map(|b| b.available_sats).unwrap_or(0);
    if available < amount_sats {
        return Err(AppError::BadRequest(format!(
            "Insufficient balance: {} sats available, {} sats requested",
            available, amount_sats
        )));
    }

    sqlx::query(
        "UPDATE balances SET available_sats = available_sats - $2, locked_sats = locked_sats + $2
         WHERE farmer_id = $1",
    )
    .bind(farmer_id)
    .bind(amount_sats)
    .execute(&mut *tx)
    .await?;

    let withdrawal_id: Uuid = sqlx::query_scalar(
        "INSERT INTO withdrawals (farmer_id, amount_sats, amount_kes, rate_used, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id",
    )
    .bind(farmer_id)
    .bind(amount_sats)
    .bind(body.amount_kes)
    .bind(btc_kes)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    tracing::info!(%withdrawal_id, %farmer_id, amount_sats, "Withdrawal queued");

    Ok(Json(WithdrawResponse {
        withdrawal_id,
        farmer_id,
        amount_sats,
        amount_kes: body.amount_kes,
        status: "pending".into(),
    }))
}

/// Fetch the most recent BTC/KES rate, applying `max_rate_stale_secs`.
/// If the cached rate is stale, a live fetch is attempted.
/// Returns an error if no fresh rate can be obtained.
async fn get_rate_with_staleness_check(state: &SharedState) -> AppResult<Decimal> {
    #[derive(FromRow)]
    struct RateRow {
        btc_kes: Decimal,
        fetched_at: DateTime<Utc>,
    }

    let row: Option<RateRow> = sqlx::query_as(
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
        tracing::warn!(age_secs = age, "Withdrawal: cached rate is stale, fetching live rate");
    }

    // Cache empty or stale — fetch live rate.
    let rate = state
        .oracle
        .fetch_rate()
        .await
        .map_err(|e| AppError::Oracle(format!("Rate stale and live fetch failed: {}", e)))?;

    let btc_kes = Decimal::try_from(rate.btc_kes)
        .map(|d| d.round_dp(4))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("rate conversion: {}", e)))?;
    let btc_usd = Decimal::try_from(rate.btc_usd)
        .map(|d| d.round_dp(4))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("rate conversion: {}", e)))?;

    // Persist fresh rate.
    sqlx::query("INSERT INTO rate_cache (btc_kes, btc_usd) VALUES ($1, $2)")
        .bind(btc_kes)
        .bind(btc_usd)
        .execute(&state.db)
        .await?;

    Ok(btc_kes)
}
