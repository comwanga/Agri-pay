use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Serialize)]
pub struct RateResponse {
    pub btc_kes: Decimal,
    pub btc_usd: Decimal,
    pub fetched_at: DateTime<Utc>,
    pub live: bool,
}

#[derive(FromRow)]
struct RateCacheRow {
    btc_kes: Decimal,
    btc_usd: Decimal,
    fetched_at: DateTime<Utc>,
}

/// GET /api/oracle/rate
pub async fn get_rate(State(state): State<SharedState>) -> AppResult<Json<RateResponse>> {
    let cached: Option<RateCacheRow> = sqlx::query_as(
        "SELECT btc_kes, btc_usd, fetched_at FROM rate_cache ORDER BY fetched_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?;

    let cache_ttl = state.oracle.cache_ttl_secs as i64;

    if let Some(ref row) = cached {
        let age = Utc::now()
            .signed_duration_since(row.fetched_at)
            .num_seconds();
        if age < cache_ttl {
            return Ok(Json(RateResponse {
                btc_kes: row.btc_kes,
                btc_usd: row.btc_usd,
                fetched_at: row.fetched_at,
                live: false,
            }));
        }
    }

    // Fetch fresh rate
    match state.oracle.fetch_rate().await {
        Ok(rate) => {
            // Fix-6: propagate conversion error rather than silently storing 0,
            // and round to 4 dp to eliminate f64 representation noise.
            let btc_kes = Decimal::try_from(rate.btc_kes)
                .map(|d| d.round_dp(4))
                .map_err(|e| {
                    tracing::error!("btc_kes f64→Decimal conversion failed: {}", e);
                    AppError::Oracle(format!("Rate conversion error: {}", e))
                })?;
            let btc_usd = Decimal::try_from(rate.btc_usd)
                .map(|d| d.round_dp(4))
                .map_err(|e| AppError::Oracle(format!("Rate conversion error: {}", e)))?;

            sqlx::query("INSERT INTO rate_cache (btc_kes, btc_usd) VALUES ($1, $2)")
                .bind(btc_kes)
                .bind(btc_usd)
                .execute(&state.db)
                .await?;

            Ok(Json(RateResponse {
                btc_kes,
                btc_usd,
                fetched_at: Utc::now(),
                live: true,
            }))
        }
        Err(e) => {
            tracing::warn!("Live rate fetch failed ({}), serving stale cache", e);
            match cached {
                Some(row) => Ok(Json(RateResponse {
                    btc_kes: row.btc_kes,
                    btc_usd: row.btc_usd,
                    fetched_at: row.fetched_at,
                    live: false,
                })),
                None => Err(AppError::Oracle(format!("Exchange rate unavailable: {}", e))),
            }
        }
    }
}
