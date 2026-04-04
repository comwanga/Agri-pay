use crate::config::Config;
use crate::mpesa::MpesaClient;
use crate::oracle::RateOracle;
use reqwest::Client;
use sqlx::PgPool;
use std::sync::Arc;

pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub http: Client,
    pub mpesa: MpesaClient,
    pub oracle: RateOracle,
}

pub type SharedState = Arc<AppState>;
