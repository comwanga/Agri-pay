//! Lightning tip endpoint — seller-direct, no platform custody.
//!
//! Resolves a buyer's tip request directly against the seller's own Lightning
//! Address or LNURL endpoint.  Funds go straight to the seller's wallet;
//! the platform never holds them.

use crate::state::SharedState;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

const MIN_SENDABLE_MSATS: i64 = 1_000;

#[derive(Debug, Deserialize)]
pub struct TipQuery {
    pub amount: i64, // millisatoshis
}

/// GET /api/lnurl/tip/{seller_id}?amount={msats}
///
/// Fetches a BOLT11 invoice directly from the seller's Lightning Address / LNURL.
/// Funds go straight to the seller's wallet — the platform holds nothing.
pub async fn tip_invoice(
    State(state): State<SharedState>,
    Path(seller_id): Path<uuid::Uuid>,
    Query(q): Query<TipQuery>,
) -> impl axum::response::IntoResponse {
    if q.amount < MIN_SENDABLE_MSATS {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "amount too small — minimum is 1 sat" })),
        );
    }

    let row: Option<(String,)> = sqlx::query_as(
        "SELECT ln_address FROM farmers WHERE id = $1 AND ln_address IS NOT NULL LIMIT 1",
    )
    .bind(seller_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let ln_address = match row {
        Some((addr,)) => addr,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "Seller has not configured a Lightning Address"
                })),
            );
        }
    };

    match state.lnurl.request_invoice(&ln_address, q.amount).await {
        Ok(inv) => (
            StatusCode::OK,
            Json(serde_json::json!({ "pr": inv.bolt11 })),
        ),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}
