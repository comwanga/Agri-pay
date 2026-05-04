use crate::config::Config;
use crate::lnurl::LnurlClient;
use crate::mpesa::MpesaClient;
use crate::oracle::RateOracle;
use metrics_exporter_prometheus::PrometheusHandle;
use reqwest::Client;
use sqlx::PgPool;
use std::sync::Arc;

pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub http: Client,
    pub oracle: RateOracle,
    pub lnurl: LnurlClient,
    pub mpesa: Option<MpesaClient>,
    /// Prometheus metrics render handle.  `None` if metrics setup failed at startup.
    pub metrics: Option<PrometheusHandle>,
    pub s3_client: aws_sdk_s3::Client,
}

pub type SharedState = Arc<AppState>;
