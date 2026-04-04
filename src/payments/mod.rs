pub mod handlers;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Payment lifecycle in v2.
/// M-Pesa cash-out is tracked separately in the `withdrawals` table.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentStatus {
    Created,
    InvoiceCreated,
    BitcoinReceived,
    CreditedToFarmer,
    Failed,
}

impl std::fmt::Display for PaymentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            PaymentStatus::Created => "created",
            PaymentStatus::InvoiceCreated => "invoice_created",
            PaymentStatus::BitcoinReceived => "bitcoin_received",
            PaymentStatus::CreditedToFarmer => "credited_to_farmer",
            PaymentStatus::Failed => "failed",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Serialize)]
pub struct Payment {
    pub id: Uuid,
    pub farmer_id: Uuid,
    pub btcpay_invoice_id: Option<String>,
    pub btcpay_payment_url: Option<String>,
    pub amount_sats: i64,
    pub amount_kes: Decimal,
    pub rate_used: Decimal,
    pub status: String,
    pub failure_reason: Option<String>,
    pub crop_type: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PaymentWithFarmer {
    #[serde(flatten)]
    pub payment: Payment,
    pub farmer_name: String,
    pub farmer_phone: String,
}
