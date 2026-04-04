use anyhow::{bail, Context, Result};

/// Known example/placeholder JWT secrets from documentation and .env.example.
/// If JWT_SECRET matches any of these in a non-sandbox environment, startup fails.
const EXAMPLE_JWT_SECRETS: &[&str] = &[
    "dev-jwt-secret-replace-in-production-32x",
    "dev-jwt-secret-change-in-production!!",
    "your-jwt-secret-min-32-chars",
    "change-this-in-production-min-32-chars",
];

#[derive(Clone, Debug)]
pub struct Config {
    // Server
    pub host: String,
    pub port: u16,
    // Database
    pub database_url: String,
    // BTCPay
    pub btcpay_url: String,
    pub btcpay_api_key: String,
    pub btcpay_store_id: String,
    pub btcpay_webhook_secret: String,
    // JWT
    pub jwt_secret: String,
    pub jwt_expiry_hours: u64,
    // Admin
    pub admin_password_hash: String,
    // M-Pesa
    pub mpesa_env: String,
    pub mpesa_consumer_key: String,
    pub mpesa_consumer_secret: String,
    pub mpesa_shortcode: String,
    pub mpesa_initiator_name: String,
    pub mpesa_initiator_password: String,
    pub mpesa_cert_path: String,
    pub mpesa_result_url: String,
    pub mpesa_timeout_url: String,
    // Oracle
    pub coingecko_api_url: String,
    pub rate_cache_seconds: u64,
    pub max_rate_stale_secs: u64,
    // Background workers
    pub invoice_expiry_secs: u64,
    pub expiry_interval_secs: u64,
    pub reconcile_interval_secs: u64,
    pub disburse_stale_secs: u64,
    // Security / CORS
    pub webhook_secret: String,
    pub allowed_origins: Vec<String>,
    // Observability
    pub log_format: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let mpesa_env = std::env::var("MPESA_ENV").unwrap_or_else(|_| "sandbox".into());
        let mpesa_consumer_key = std::env::var("MPESA_CONSUMER_KEY").unwrap_or_default();
        let mpesa_consumer_secret = std::env::var("MPESA_CONSUMER_SECRET").unwrap_or_default();
        let mpesa_initiator_password =
            std::env::var("MPESA_INITIATOR_PASSWORD").unwrap_or_default();
        let mpesa_cert_path = std::env::var("MPESA_CERT_PATH").unwrap_or_default();

        if mpesa_env != "sandbox" {
            if mpesa_consumer_key.is_empty() {
                bail!("MPESA_CONSUMER_KEY is required when MPESA_ENV != sandbox");
            }
            if mpesa_consumer_secret.is_empty() {
                bail!("MPESA_CONSUMER_SECRET is required when MPESA_ENV != sandbox");
            }
            if mpesa_initiator_password.is_empty() {
                bail!("MPESA_INITIATOR_PASSWORD is required when MPESA_ENV != sandbox");
            }
            if mpesa_cert_path.is_empty() {
                bail!("MPESA_CERT_PATH is required when MPESA_ENV != sandbox");
            }
        }

        let webhook_secret =
            std::env::var("WEBHOOK_SECRET").unwrap_or_else(|_| "dev-webhook-secret".into());
        let base_url =
            std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3001".into());

        let mpesa_result_url = std::env::var("MPESA_RESULT_URL").unwrap_or_else(|_| {
            format!("{}/api/webhooks/mpesa/{}/result", base_url, webhook_secret)
        });
        let mpesa_timeout_url = std::env::var("MPESA_TIMEOUT_URL").unwrap_or_else(|_| {
            format!("{}/api/webhooks/mpesa/{}/timeout", base_url, webhook_secret)
        });

        let allowed_origins: Vec<String> = std::env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:5173".into())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let jwt_secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "dev-jwt-secret-change-in-production!!".into());

        if jwt_secret.len() < 32 {
            bail!("JWT_SECRET must be at least 32 characters");
        }

        // S5: Prevent production deployments with example/default JWT secrets.
        // We use MPESA_ENV as the production proxy (no explicit ENVIRONMENT var exists).
        if mpesa_env != "sandbox" && EXAMPLE_JWT_SECRETS.contains(&jwt_secret.as_str()) {
            bail!(
                "JWT_SECRET is set to a known example value. \
                 Generate a secure secret with: openssl rand -base64 48"
            );
        } else if EXAMPLE_JWT_SECRETS.contains(&jwt_secret.as_str()) {
            // Dev mode: warn loudly but allow startup.
            eprintln!(
                "\n⚠️  WARNING: JWT_SECRET is an example value. \
                 Do not deploy this to production.\n"
            );
        }

        Ok(Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3001".into())
                .parse()
                .context("Invalid PORT")?,
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL is required")?,
            btcpay_url: std::env::var("BTCPAY_URL")
                .unwrap_or_else(|_| "http://localhost:14142".into()),
            btcpay_api_key: std::env::var("BTCPAY_API_KEY").unwrap_or_default(),
            btcpay_store_id: std::env::var("BTCPAY_STORE_ID").unwrap_or_default(),
            btcpay_webhook_secret: std::env::var("BTCPAY_WEBHOOK_SECRET")
                .unwrap_or_else(|_| "dev-btcpay-webhook-secret".into()),
            jwt_secret,
            jwt_expiry_hours: std::env::var("JWT_EXPIRY_HOURS")
                .unwrap_or_else(|_| "24".into())
                .parse()
                .context("Invalid JWT_EXPIRY_HOURS")?,
            admin_password_hash: std::env::var("ADMIN_PASSWORD_HASH").unwrap_or_default(),
            mpesa_env,
            mpesa_consumer_key,
            mpesa_consumer_secret,
            mpesa_shortcode: std::env::var("MPESA_SHORTCODE").unwrap_or_else(|_| "600998".into()),
            mpesa_initiator_name: std::env::var("MPESA_INITIATOR_NAME")
                .unwrap_or_else(|_| "testapi".into()),
            mpesa_initiator_password,
            mpesa_cert_path,
            mpesa_result_url,
            mpesa_timeout_url,
            coingecko_api_url: std::env::var("COINGECKO_API_URL")
                .unwrap_or_else(|_| "https://api.coingecko.com/api/v3".into()),
            rate_cache_seconds: std::env::var("RATE_CACHE_SECONDS")
                .unwrap_or_else(|_| "60".into())
                .parse()
                .context("Invalid RATE_CACHE_SECONDS")?,
            max_rate_stale_secs: std::env::var("MAX_RATE_STALE_SECS")
                .unwrap_or_else(|_| "3600".into())
                .parse()
                .context("Invalid MAX_RATE_STALE_SECS")?,
            invoice_expiry_secs: std::env::var("INVOICE_EXPIRY_SECS")
                .unwrap_or_else(|_| "86400".into())
                .parse()
                .context("Invalid INVOICE_EXPIRY_SECS")?,
            expiry_interval_secs: std::env::var("EXPIRY_INTERVAL_SECS")
                .unwrap_or_else(|_| "600".into())
                .parse()
                .context("Invalid EXPIRY_INTERVAL_SECS")?,
            reconcile_interval_secs: std::env::var("RECONCILE_INTERVAL_SECS")
                .unwrap_or_else(|_| "300".into())
                .parse()
                .context("Invalid RECONCILE_INTERVAL_SECS")?,
            disburse_stale_secs: std::env::var("DISBURSE_STALE_SECS")
                .unwrap_or_else(|_| "1800".into())
                .parse()
                .context("Invalid DISBURSE_STALE_SECS")?,
            webhook_secret,
            allowed_origins,
            log_format: std::env::var("LOG_FORMAT").unwrap_or_else(|_| "text".into()),
        })
    }

    pub fn mpesa_base_url(&self) -> &str {
        if self.mpesa_env == "sandbox" {
            "https://sandbox.safaricom.co.ke"
        } else {
            "https://api.safaricom.co.ke"
        }
    }
}
