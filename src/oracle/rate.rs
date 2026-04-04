use crate::config::Config;
use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct ExchangeRate {
    pub btc_kes: f64,
    pub btc_usd: f64,
}

#[derive(Deserialize)]
struct CoinGeckoResponse {
    bitcoin: CoinGeckoPrices,
}

#[derive(Deserialize)]
struct CoinGeckoPrices {
    kes: f64,
    usd: f64,
}

pub struct RateOracle {
    http: Client,
    api_url: String,
    pub cache_ttl_secs: u64,
}

impl RateOracle {
    pub fn new(config: &Config, http: Client) -> Self {
        Self {
            http,
            api_url: config.coingecko_api_url.clone(),
            cache_ttl_secs: config.rate_cache_seconds,
        }
    }

    pub async fn fetch_rate(&self) -> Result<ExchangeRate> {
        let url = format!(
            "{}/simple/price?ids=bitcoin&vs_currencies=kes,usd",
            self.api_url
        );

        let resp = self
            .http
            .get(&url)
            .header("User-Agent", "agri-pay/0.2")
            .send()
            .await?
            .json::<CoinGeckoResponse>()
            .await?;

        Ok(ExchangeRate {
            btc_kes: resp.bitcoin.kes,
            btc_usd: resp.bitcoin.usd,
        })
    }

    /// Convert KES amount to satoshis using the given BTC/KES rate.
    #[allow(dead_code)]
    pub fn kes_to_sats(amount_kes: f64, btc_kes_rate: f64) -> u64 {
        if btc_kes_rate <= 0.0 {
            return 0;
        }
        let btc_amount = amount_kes / btc_kes_rate;
        let sats = btc_amount * 100_000_000.0;
        sats.round() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::RateOracle;

    const RATE: f64 = 10_000_000.0;

    #[test]
    fn test_kes_to_sats_round_number() {
        assert_eq!(RateOracle::kes_to_sats(100.0, RATE), 1_000);
    }

    #[test]
    fn test_kes_to_sats_one_million_kes() {
        assert_eq!(RateOracle::kes_to_sats(1_000_000.0, RATE), 10_000_000);
    }

    #[test]
    fn test_kes_to_sats_rounding() {
        assert_eq!(RateOracle::kes_to_sats(1.0, RATE), 10);
    }

    #[test]
    fn test_kes_to_sats_zero_rate_returns_zero() {
        assert_eq!(RateOracle::kes_to_sats(1000.0, 0.0), 0);
    }
}
