use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
struct LnurlPayParams {
    callback: String,
    #[serde(rename = "minSendable")]
    min_sendable: i64,
    #[serde(rename = "maxSendable")]
    max_sendable: i64,
    tag: String,
}

#[derive(Deserialize)]
struct LnurlInvoiceResponse {
    pr: String,
}

pub struct LnurlClient {
    http: Client,
}

impl LnurlClient {
    pub fn new(http: Client) -> Self {
        Self { http }
    }

    /// Fetch LNURL-pay parameters from a Lightning Address (user@domain).
    async fn fetch_pay_params(&self, ln_address: &str) -> AppResult<LnurlPayParams> {
        let mut parts = ln_address.splitn(2, '@');
        let user = parts
            .next()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::BadRequest("Invalid Lightning Address: missing user".into()))?;
        let domain = parts
            .next()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::BadRequest("Invalid Lightning Address: missing domain".into())
            })?;

        let url = format!("https://{}/.well-known/lnurlp/{}", domain, user);

        let resp = self
            .http
            .get(&url)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| AppError::Lnurl(format!("LNURL endpoint unreachable: {}", e)))?;

        if !resp.status().is_success() {
            return Err(AppError::Lnurl(format!(
                "LNURL endpoint returned HTTP {}",
                resp.status()
            )));
        }

        let params: LnurlPayParams = resp
            .json()
            .await
            .map_err(|e| AppError::Lnurl(format!("Invalid LNURL-pay response: {}", e)))?;

        if params.tag != "payRequest" {
            return Err(AppError::Lnurl(format!(
                "Expected LNURL payRequest tag, got: {}",
                params.tag
            )));
        }

        Ok(params)
    }

    /// Request a bolt11 invoice for `amount_msats` millisatoshis.
    /// Returns the bolt11 payment request string.
    pub async fn request_invoice(&self, ln_address: &str, amount_msats: i64) -> AppResult<String> {
        let params = self.fetch_pay_params(ln_address).await?;

        if amount_msats < params.min_sendable {
            return Err(AppError::BadRequest(format!(
                "Amount {} msats is below the minimum {} msats for this wallet",
                amount_msats, params.min_sendable
            )));
        }
        if amount_msats > params.max_sendable {
            return Err(AppError::BadRequest(format!(
                "Amount {} msats exceeds the maximum {} msats for this wallet",
                amount_msats, params.max_sendable
            )));
        }

        let callback_url = format!("{}?amount={}", params.callback, amount_msats);

        let resp = self
            .http
            .get(&callback_url)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| AppError::Lnurl(format!("Invoice callback failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(AppError::Lnurl(format!(
                "Invoice callback returned HTTP {}",
                resp.status()
            )));
        }

        let inv: LnurlInvoiceResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Lnurl(format!("Invalid invoice response: {}", e)))?;

        if inv.pr.is_empty() {
            return Err(AppError::Lnurl("Received empty bolt11 invoice".into()));
        }

        Ok(inv.pr)
    }
}
