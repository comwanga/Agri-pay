use crate::config::Config;
use crate::lnurl::LnurlClient;
use crate::oracle::RateOracle;
use sqlx::PgPool;
use std::sync::Arc;

pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub oracle: RateOracle,
    pub lnurl: LnurlClient,
}

pub type SharedState = Arc<AppState>;
