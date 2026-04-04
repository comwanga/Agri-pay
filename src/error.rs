use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[allow(dead_code)]
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("BTCPay error: {0}")]
    BtcPay(String),

    #[error("M-Pesa error: {0}")]
    Mpesa(String),

    #[error("Oracle error: {0}")]
    Oracle(String),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Database(e) => {
                // Detect unique violations and surface them as 409
                let msg = e.to_string();
                if msg.contains("unique") || msg.contains("duplicate") {
                    tracing::warn!("Unique constraint violation: {}", e);
                    return (
                        StatusCode::CONFLICT,
                        Json(json!({ "error": "A record with that value already exists" })),
                    )
                        .into_response();
                }
                tracing::error!("Database error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into())
            }
            AppError::Jwt(e) => {
                tracing::warn!("JWT validation error: {}", e);
                (StatusCode::UNAUTHORIZED, "Invalid or expired token".into())
            }
            AppError::BtcPay(msg) => {
                tracing::error!("BTCPay error: {}", msg);
                (StatusCode::BAD_GATEWAY, msg.clone())
            }
            AppError::Mpesa(msg) => {
                tracing::error!("M-Pesa error: {}", msg);
                (StatusCode::BAD_GATEWAY, msg.clone())
            }
            AppError::Oracle(msg) => {
                tracing::error!("Oracle error: {}", msg);
                (StatusCode::BAD_GATEWAY, msg.clone())
            }
            AppError::Internal(e) => {
                tracing::error!("Internal error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".into(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
