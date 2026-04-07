use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Record an order lifecycle event into the `order_events` table.
/// Errors are logged but non-fatal.
pub async fn record_order_event(
    pool: &PgPool,
    order_id: Uuid,
    actor_id: Option<Uuid>,
    event_type: &str,
    notes: Option<&str>,
    metadata: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO order_events (order_id, actor_id, event_type, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(order_id)
    .bind(actor_id)
    .bind(event_type)
    .bind(notes)
    .bind(metadata)
    .execute(pool)
    .await?;
    Ok(())
}
