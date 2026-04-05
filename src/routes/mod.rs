use crate::auth;
use crate::btcpay::webhook as btcpay_webhook;
use crate::farmers::handlers as farmer_handlers;
use crate::mpesa::webhook as mpesa_webhook;
use crate::oracle::handlers as oracle_handlers;
use crate::orders::handlers as order_handlers;
use crate::payments::handlers as payment_handlers;
use crate::state::SharedState;
use crate::wallet::handlers as wallet_handlers;
use axum::{
    routing::{delete, get, post, put},
    Json, Router,
};
use tower::limit::ConcurrencyLimitLayer;

pub fn router(_state: SharedState) -> Router<SharedState> {
    // ── Auth ─────────────────────────────────────────────────────────────────
    let auth_routes = Router::new()
        .route("/auth/login", post(auth::login))
        .route("/auth/nostr", post(auth::nostr_login))
        .route("/auth/register", post(auth::register));

    // ── Farmers ──────────────────────────────────────────────────────────────
    let farmer_routes = Router::new()
        .route(
            "/farmers",
            get(farmer_handlers::list_farmers).post(farmer_handlers::create_farmer),
        )
        .route(
            "/farmers/:id",
            get(farmer_handlers::get_farmer)
                .put(farmer_handlers::update_farmer)
                .delete(farmer_handlers::delete_farmer),
        );

    // ── Payments ─────────────────────────────────────────────────────────────
    let payment_routes = Router::new()
        .route(
            "/payments",
            get(payment_handlers::list_payments).post(payment_handlers::create_payment),
        )
        .route("/payments/:id", get(payment_handlers::get_payment));

    // ── Wallet ────────────────────────────────────────────────────────────────
    let wallet_routes = Router::new()
        .route("/wallet/balance", get(wallet_handlers::get_balance))
        .route(
            "/wallet/withdraw",
            post(wallet_handlers::request_withdrawal),
        );

    // ── Orders ────────────────────────────────────────────────────────────────
    let order_routes = Router::new()
        .route(
            "/orders",
            get(order_handlers::list_orders).post(order_handlers::create_order),
        )
        .route("/orders/:id/fill", put(order_handlers::fill_order))
        .route("/orders/:id", delete(order_handlers::cancel_order));

    // ── Oracle ────────────────────────────────────────────────────────────────
    let oracle_routes = Router::new().route("/oracle/rate", get(oracle_handlers::get_rate));

    // ── Webhooks (no JWT — their own auth mechanisms) ────────────────────────
    let webhook_routes = Router::new()
        .route(
            "/webhooks/btcpay",
            post(btcpay_webhook::handle_btcpay_webhook),
        )
        .route(
            "/webhooks/mpesa/:secret/result",
            post(mpesa_webhook::mpesa_result),
        )
        .route(
            "/webhooks/mpesa/:secret/timeout",
            post(mpesa_webhook::mpesa_timeout),
        );

    // ── Health ────────────────────────────────────────────────────────────────
    let health_route = Router::new().route("/health", get(health));

    Router::new()
        .merge(auth_routes)
        .merge(farmer_routes)
        .merge(payment_routes)
        .merge(wallet_routes)
        .merge(order_routes)
        .merge(oracle_routes)
        .merge(webhook_routes)
        .merge(health_route)
        .layer(ConcurrencyLimitLayer::new(200))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION")
    }))
}
