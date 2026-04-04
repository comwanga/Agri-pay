use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Record a payment event into the `payment_events` table.
/// Errors are logged but non-fatal — callers may choose to ignore the result.
pub async fn record_event(
    pool: &PgPool,
    payment_id: Uuid,
    event_type: &str,
    data: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO payment_events (payment_id, event_type, data) VALUES ($1, $2, $3)",
    )
    .bind(payment_id)
    .bind(event_type)
    .bind(data)
    .execute(pool)
    .await?;
    Ok(())
}
