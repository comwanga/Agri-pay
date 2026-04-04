use super::jwt::{validate_token, Claims};
use crate::error::AppError;
use crate::state::SharedState;
use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};

/// Axum extractor that reads the `Authorization: Bearer <token>` header,
/// validates the JWT, and injects `Claims` into the request extensions.
#[async_trait]
impl FromRequestParts<SharedState> for Claims {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(&parts.headers)
            .ok_or_else(|| AppError::Unauthorized("Missing or malformed Authorization header".into()))?;

        let claims = validate_token(&state.config.jwt_secret, token)?;
        Ok(claims)
    }
}

fn extract_bearer(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?;
    value.strip_prefix("Bearer ")
}
