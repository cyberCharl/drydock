use std::{env, fs, path::PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct Config {
    pub api_url: String,
    pub user: String,
}

#[derive(Debug, Default, Deserialize)]
struct FileConfig {
    api_url: Option<String>,
    user: Option<String>,
}

pub fn load_config() -> Result<Config> {
    let file_config = load_file_config()?;

    let api_url = env::var("DRYDOCK_API_URL")
        .ok()
        .or(file_config.api_url)
        .unwrap_or_else(|| "http://127.0.0.1:3000".to_string());

    let user = env::var("DRYDOCK_USER")
        .ok()
        .or(file_config.user)
        .or_else(|| env::var("USER").ok())
        .unwrap_or_else(|| "drydock-cli".to_string());

    Ok(Config {
        api_url: api_url.trim_end_matches('/').to_string(),
        user,
    })
}

fn load_file_config() -> Result<FileConfig> {
    let Some(path) = config_path() else {
        return Ok(FileConfig::default());
    };

    if !path.exists() {
        return Ok(FileConfig::default());
    }

    let raw = fs::read_to_string(&path)
        .with_context(|| format!("failed to read config file {}", path.display()))?;

    toml::from_str(&raw)
        .with_context(|| format!("failed to parse config file {}", path.display()))
}

fn config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("drydock").join("config.toml"))
}
