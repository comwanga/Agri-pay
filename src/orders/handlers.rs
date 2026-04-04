use crate::auth::jwt::{Claims, Role};
use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct Order {
    pub id: Uuid,
    pub farmer_id: Uuid,
    pub farmer_name: String,
    pub farmer_phone: String,
    pub crop_type: String,
    pub quantity_kg: Decimal,
    pub price_per_kg_sats: i64,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrderRequest {
    pub crop_type: String,
    pub quantity_kg: Decimal,
    pub price_per_kg_sats: i64,
}

const MAX_CROP_TYPE_LEN: usize = 100;

const ORDER_SELECT: &str = r#"
    SELECT o.id, o.farmer_id, f.name AS farmer_name, f.phone AS farmer_phone,
           o.crop_type, o.quantity_kg, o.price_per_kg_sats,
           o.status, o.created_at, o.updated_at
    FROM orders o
    JOIN farmers f ON f.id = o.farmer_id
"#;

/// GET /api/orders
pub async fn list_orders(
    State(state): State<SharedState>,
    _claims: Claims,
) -> AppResult<Json<Vec<Order>>> {
    let orders: Vec<Order> = sqlx::query_as(&format!(
        "{} WHERE o.status = 'open' ORDER BY o.created_at DESC LIMIT 200",
        ORDER_SELECT
    ))
    .fetch_all(&state.db)
    .await?;

    Ok(Json(orders))
}

/// POST /api/orders
pub async fn create_order(
    State(state): State<SharedState>,
    claims: Claims,
    Json(body): Json<CreateOrderRequest>,
) -> AppResult<Json<Order>> {
    if claims.role != Role::Farmer {
        return Err(AppError::Forbidden("Farmer role required".into()));
    }

    let farmer_id = claims
        .farmer_id
        .ok_or_else(|| AppError::Forbidden("Farmer role required".into()))?;

    if body.crop_type.trim().is_empty() {
        return Err(AppError::BadRequest("crop_type is required".into()));
    }
    if body.crop_type.len() > MAX_CROP_TYPE_LEN {
        return Err(AppError::BadRequest(format!(
            "crop_type exceeds maximum length of {} characters",
            MAX_CROP_TYPE_LEN
        )));
    }
    if body.quantity_kg <= Decimal::ZERO {
        return Err(AppError::BadRequest("quantity_kg must be positive".into()));
    }
    if body.price_per_kg_sats <= 0 {
        return Err(AppError::BadRequest(
            "price_per_kg_sats must be positive".into(),
        ));
    }

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO orders (farmer_id, crop_type, quantity_kg, price_per_kg_sats)
         VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(farmer_id)
    .bind(body.crop_type.trim())
    .bind(body.quantity_kg)
    .bind(body.price_per_kg_sats)
    .fetch_one(&state.db)
    .await?;

    let order: Order = sqlx::query_as(&format!("{} WHERE o.id = $1", ORDER_SELECT))
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(order))
}

/// PUT /api/orders/:id/fill
pub async fn fill_order(
    State(state): State<SharedState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Order>> {
    match claims.role {
        Role::Admin | Role::Operator => {}
        _ => return Err(AppError::Forbidden("Admin or operator required".into())),
    }

    #[derive(FromRow)]
    struct OrderStatus { status: String }
    let row: Option<OrderStatus> = sqlx::query_as("SELECT status FROM orders WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    let current_status = row
        .ok_or_else(|| AppError::NotFound(format!("Order {} not found", id)))?
        .status;

    if current_status != "open" {
        return Err(AppError::BadRequest(format!(
            "Order is already {}",
            current_status
        )));
    }

    sqlx::query("UPDATE orders SET status = 'filled' WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    let order: Order = sqlx::query_as(&format!("{} WHERE o.id = $1", ORDER_SELECT))
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(order))
}

/// DELETE /api/orders/:id
pub async fn cancel_order(
    State(state): State<SharedState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let farmer_id = claims.farmer_id;

    #[derive(FromRow)]
    struct OrderOwner { farmer_id: Uuid, status: String }
    let row: Option<OrderOwner> = sqlx::query_as(
        "SELECT farmer_id, status FROM orders WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound(format!("Order {} not found", id)))?;
    let order_farmer_id = row.farmer_id;
    let status = row.status;

    if claims.role == Role::Farmer && farmer_id != Some(order_farmer_id) {
        return Err(AppError::Forbidden("Access denied".into()));
    }

    if status != "open" {
        return Err(AppError::BadRequest(format!(
            "Cannot cancel an order with status '{}'",
            status
        )));
    }

    sqlx::query("UPDATE orders SET status = 'cancelled' WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "cancelled": true })))
}
