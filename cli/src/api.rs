use anyhow::{anyhow, Context, Result};
use reqwest::{Client, Method};
use serde_json::Value;

use crate::config::Config;

#[derive(Clone)]
pub struct ApiClient {
    base_url: String,
    actor: String,
    client: Client,
}

impl ApiClient {
    pub fn new(config: Config) -> Result<Self> {
        let client = Client::builder().build()?;

        Ok(Self {
            base_url: config.api_url,
            actor: config.user,
            client,
        })
    }

    pub async fn get(&self, path: &str) -> Result<Value> {
        self.request(Method::GET, path, &[], None).await
    }

    pub async fn get_with_query(&self, path: &str, query: &[(String, String)]) -> Result<Value> {
        self.request(Method::GET, path, query, None).await
    }

    pub async fn post(&self, path: &str, body: Value) -> Result<Value> {
        self.request(Method::POST, path, &[], Some(body)).await
    }

    pub async fn patch(&self, path: &str, body: Value) -> Result<Value> {
        self.request(Method::PATCH, path, &[], Some(body)).await
    }

    pub async fn delete(&self, path: &str) -> Result<Value> {
        self.request(Method::DELETE, path, &[], None).await
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        query: &[(String, String)],
        body: Option<Value>,
    ) -> Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self
            .client
            .request(method, &url)
            .header("accept", "application/json")
            .header("x-drydock-user", &self.actor);

        if !query.is_empty() {
            request = request.query(query);
        }

        if let Some(ref body_value) = body {
            request = request.json(body_value);
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("request failed: {}", url))?;
        let status = response.status();
        let text = response.text().await?;

        if text.trim().is_empty() {
            if status.is_success() {
                return Ok(Value::Null);
            }

            return Err(anyhow!("HTTP {} returned an empty error response", status.as_u16()));
        }

        let json = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| Value::String(text));

        if status.is_success() {
            return Ok(json);
        }

        if let Some(error) = json.get("error").and_then(Value::as_object) {
            let code = error
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or("error");
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("request failed");

            return Err(anyhow!("HTTP {} {}: {}", status.as_u16(), code, message));
        }

        Err(anyhow!("HTTP {}: {}", status.as_u16(), json))
    }
}
