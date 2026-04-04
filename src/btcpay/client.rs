use crate::config::Config;
use crate::error::AppError;
use anyhow::Context;
use reqwest::Client;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

pub struct BtcPayClient {
    http: Client,
    base_url: String,
    api_key: String,
    store_id: String,
}

#[derive(Debug, Serialize)]
struct CreateInvoiceRequest {
    amount: String,
    currency: String,
    #[serde(rename = "orderId", skip_serializing_if = "Option::is_none")]
    order_id: Option<String>,
    #[serde(rename = "itemDesc", skip_serializing_if = "Option::is_none")]
    item_desc: Option<String>,
    #[serde(rename = "redirectURL", skip_serializing_if = "Option::is_none")]
    redirect_url: Option<String>,
    checkout: CheckoutOptions,
}

#[derive(Debug, Serialize)]
struct CheckoutOptions {
    #[serde(rename = "speedPolicy")]
    speed_policy: String,
}

#[derive(Debug, Deserialize)]
pub struct BtcPayInvoice {
    pub id: String,
    #[serde(rename = "checkoutLink")]
    pub checkout_link: String,
    #[allow(dead_code)]
    pub status: String,
}

impl BtcPayClient {
    pub fn new(config: &Config, http: Client) -> Self {
        Self {
            http,
            base_url: config.btcpay_url.trim_end_matches('/').to_string(),
            api_key: config.btcpay_api_key.clone(),
            store_id: config.btcpay_store_id.clone(),
        }
    }

    /// Create a BTCPay invoice. `amount_sats` is converted to BTC for the API.
    pub async fn create_invoice(
        &self,
        amount_sats: i64,
        description: &str,
        order_id: Option<&str>,
        redirect_url: Option<&str>,
    ) -> Result<BtcPayInvoice, AppError> {
        // BTCPay accepts BTC amounts as strings with 8 decimal places
        let btc_amount = Decimal::new(amount_sats, 8); // sats / 10^8
        let amount_str = format!("{:.8}", btc_amount);

        let body = CreateInvoiceRequest {
            amount: amount_str,
            currency: "BTC".into(),
            order_id: order_id.map(|s| s.to_string()),
            item_desc: Some(description.to_string()),
            redirect_url: redirect_url.map(|s| s.to_string()),
            checkout: CheckoutOptions {
                speed_policy: "LowSpeed".into(),
            },
        };

        let url = format!("{}/api/v1/stores/{}/invoices", self.base_url, self.store_id);

        let resp = self
            .http
            .post(&url)
            .header("Authorization", format!("token {}", self.api_key))
            .json(&body)
            .send()
            .await
            .context("Failed to reach BTCPay Server")
            .map_err(|e| AppError::BtcPay(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::BtcPay(format!(
                "BTCPay returned {}: {}",
                status, text
            )));
        }

        let invoice: BtcPayInvoice = resp
            .json()
            .await
            .context("Failed to parse BTCPay invoice response")
            .map_err(|e| AppError::BtcPay(e.to_string()))?;

        Ok(invoice)
    }

    /// Fetch a single invoice by ID (used by reconciliation worker).
    #[allow(dead_code)]
    pub async fn get_invoice(&self, invoice_id: &str) -> Result<BtcPayInvoice, AppError> {
        let url = format!(
            "{}/api/v1/stores/{}/invoices/{}",
            self.base_url, self.store_id, invoice_id
        );

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("token {}", self.api_key))
            .send()
            .await
            .context("Failed to reach BTCPay Server")
            .map_err(|e| AppError::BtcPay(e.to_string()))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(AppError::NotFound(format!(
                "BTCPay invoice {} not found",
                invoice_id
            )));
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::BtcPay(format!(
                "BTCPay returned {}: {}",
                status, text
            )));
        }

        let invoice: BtcPayInvoice = resp
            .json()
            .await
            .context("Failed to parse BTCPay invoice response")
            .map_err(|e| AppError::BtcPay(e.to_string()))?;

        Ok(invoice)
    }
}
