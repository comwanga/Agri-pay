use crate::auth::jwt::{Claims, Role};
use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

const MAX_NAME_LEN: usize = 200;
const MAX_COOPERATIVE_LEN: usize = 200;
const MAX_PIN_LEN: usize = 10;

#[derive(Debug, Serialize, FromRow)]
pub struct Farmer {
    pub id: Uuid,
    pub name: String,
    pub phone: String,
    pub cooperative: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFarmerRequest {
    pub name: String,
    pub phone: String,
    pub cooperative: String,
    pub pin: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFarmerRequest {
    pub name: Option<String>,
    pub cooperative: Option<String>,
    pub pin: Option<String>,
}

/// GET /api/farmers
pub async fn list_farmers(
    State(state): State<SharedState>,
    claims: Claims,
) -> AppResult<Json<Vec<Farmer>>> {
    match claims.role {
        Role::Admin | Role::Operator => {}
        _ => return Err(AppError::Forbidden("Admin or operator required".into())),
    }

    let farmers: Vec<Farmer> = sqlx::query_as(
        "SELECT id, name, phone, cooperative, created_at FROM farmers ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(farmers))
}

/// POST /api/farmers
pub async fn create_farmer(
    State(state): State<SharedState>,
    claims: Claims,
    Json(body): Json<CreateFarmerRequest>,
) -> AppResult<Json<Farmer>> {
    if claims.role != Role::Admin {
        return Err(AppError::Forbidden("Admin only".into()));
    }

    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if body.name.len() > MAX_NAME_LEN {
        return Err(AppError::BadRequest(format!(
            "name exceeds maximum length of {} characters",
            MAX_NAME_LEN
        )));
    }
    if body.cooperative.len() > MAX_COOPERATIVE_LEN {
        return Err(AppError::BadRequest(format!(
            "cooperative exceeds maximum length of {} characters",
            MAX_COOPERATIVE_LEN
        )));
    }
    if body.phone.trim().is_empty() {
        return Err(AppError::BadRequest("phone is required".into()));
    }

    let phone = crate::mpesa::normalize_phone(&body.phone)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let pin_hash: Option<String> = if let Some(pin) = &body.pin {
        if pin.len() < 4 {
            return Err(AppError::BadRequest("PIN must be at least 4 digits".into()));
        }
        if pin.len() > MAX_PIN_LEN {
            return Err(AppError::BadRequest(format!(
                "PIN exceeds maximum length of {} characters",
                MAX_PIN_LEN
            )));
        }
        Some(
            bcrypt::hash(pin, bcrypt::DEFAULT_COST)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("bcrypt error: {}", e)))?,
        )
    } else {
        None
    };

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO farmers (name, phone, cooperative, pin_hash) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(body.name.trim())
    .bind(&phone)
    .bind(body.cooperative.trim())
    .bind(&pin_hash)
    .fetch_one(&state.db)
    .await?;

    // Initialize balance row
    sqlx::query("INSERT INTO balances (farmer_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(id)
        .execute(&state.db)
        .await?;

    let farmer: Farmer = sqlx::query_as(
        "SELECT id, name, phone, cooperative, created_at FROM farmers WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(farmer))
}

/// GET /api/farmers/:id
pub async fn get_farmer(
    State(state): State<SharedState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Farmer>> {
    if claims.role == Role::Farmer && claims.farmer_id != Some(id) {
        return Err(AppError::Forbidden("Access denied".into()));
    }

    let farmer: Option<Farmer> = sqlx::query_as(
        "SELECT id, name, phone, cooperative, created_at FROM farmers WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    farmer
        .map(Json)
        .ok_or_else(|| AppError::NotFound(format!("Farmer {} not found", id)))
}

/// PUT /api/farmers/:id
pub async fn update_farmer(
    State(state): State<SharedState>,
    claims: Claims,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateFarmerRequest>,
) -> AppResult<Json<Farmer>> {
    if claims.role != Role::Admin {
        return Err(AppError::Forbidden("Admin only".into()));
    }

    #[derive(FromRow)]
    struct FarmerCheck {
        #[allow(dead_code)]
        id: Uuid,
    }
    let exists: Option<FarmerCheck> = sqlx::query_as("SELECT id FROM farmers WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!("Farmer {} not found", id)));
    }

    let pin_hash: Option<String> = if let Some(pin) = &body.pin {
        if pin.len() < 4 {
            return Err(AppError::BadRequest("PIN must be at least 4 digits".into()));
        }
        if pin.len() > MAX_PIN_LEN {
            return Err(AppError::BadRequest(format!(
                "PIN exceeds maximum length of {} characters",
                MAX_PIN_LEN
            )));
        }
        Some(
            bcrypt::hash(pin, bcrypt::DEFAULT_COST)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("bcrypt error: {}", e)))?,
        )
    } else {
        None
    };

    if let Some(ref name) = body.name {
        if name.len() > MAX_NAME_LEN {
            return Err(AppError::BadRequest(format!(
                "name exceeds maximum length of {} characters",
                MAX_NAME_LEN
            )));
        }
    }
    if let Some(ref coop) = body.cooperative {
        if coop.len() > MAX_COOPERATIVE_LEN {
            return Err(AppError::BadRequest(format!(
                "cooperative exceeds maximum length of {} characters",
                MAX_COOPERATIVE_LEN
            )));
        }
    }

    sqlx::query(
        "UPDATE farmers SET
            name        = COALESCE($2, name),
            cooperative = COALESCE($3, cooperative),
            pin_hash    = COALESCE($4, pin_hash)
         WHERE id = $1",
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.cooperative)
    .bind(&pin_hash)
    .execute(&state.db)
    .await?;

    let farmer: Farmer = sqlx::query_as(
        "SELECT id, name, phone, cooperative, created_at FROM farmers WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(farmer))
}

/// DELETE /api/farmers/:id
pub async fn delete_farmer(
    State(state): State<SharedState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != Role::Admin {
        return Err(AppError::Forbidden("Admin only".into()));
    }

    let result = sqlx::query("DELETE FROM farmers WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Farmer {} not found", id)));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}
