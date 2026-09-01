use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::error::{CommandError, CommandResult};

const KEYRING_USER: &str = "encryption_key";
const TOKENS_FILE: &str = "tokens.bin";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: String,
    pub expires_at: i64,
}

pub struct TokenStorage;

impl TokenStorage {
    fn keyring_entry() -> CommandResult<keyring::Entry> {
        let config = crate::config::get_config();
        keyring::Entry::new(config.app_identifier, KEYRING_USER)
            .map_err(|e| CommandError::Io(format!("failed to create keyring entry: {e}")))
    }

    fn tokens_path() -> CommandResult<PathBuf> {
        let config = crate::config::get_config();
        let dir = dirs::data_local_dir()
            .ok_or_else(|| CommandError::Io("local data directory unavailable".to_string()))?
            .join(config.app_identifier);
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::Io(format!("failed to create data directory: {e}")))?;
        Ok(dir.join(TOKENS_FILE))
    }

    /// Retrieve or generate the AES-256 encryption key, stored in the OS keyring.
    fn get_or_create_key() -> CommandResult<[u8; KEY_LEN]> {
        let entry = Self::keyring_entry()?;
        let b64 = base64::engine::general_purpose::STANDARD;

        match entry.get_password() {
            Ok(encoded) => {
                use base64::Engine;
                let bytes = b64.decode(&encoded).map_err(|e| {
                    CommandError::Io(format!("failed to decode encryption key: {e}"))
                })?;
                bytes.try_into().map_err(|_| {
                    CommandError::Io("stored encryption key has wrong length".to_string())
                })
            }
            Err(keyring::Error::NoEntry) => {
                use base64::Engine;
                let mut key = [0u8; KEY_LEN];
                rand::thread_rng().fill_bytes(&mut key);
                let encoded = b64.encode(key);
                entry.set_password(&encoded).map_err(|e| {
                    CommandError::Io(format!("failed to store encryption key: {e}"))
                })?;
                Ok(key)
            }
            Err(e) => Err(CommandError::Io(format!(
                "failed to read encryption key: {e}"
            ))),
        }
    }

    fn encrypt(plaintext: &[u8], key: &[u8; KEY_LEN]) -> CommandResult<Vec<u8>> {
        let cipher = Aes256Gcm::new(key.into());
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| CommandError::Io(format!("encryption failed: {e}")))?;

        let mut result = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        result.extend_from_slice(&nonce_bytes);
        result.extend(ciphertext);
        Ok(result)
    }

    fn decrypt(data: &[u8], key: &[u8; KEY_LEN]) -> CommandResult<Vec<u8>> {
        if data.len() <= NONCE_LEN {
            return Err(CommandError::Io("encrypted data too short".to_string()));
        }

        let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
        let cipher = Aes256Gcm::new(key.into());
        let nonce = Nonce::from_slice(nonce_bytes);

        cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| CommandError::Io(format!("decryption failed: {e}")))
    }

    pub fn store_tokens(
        access_token: &str,
        refresh_token: Option<&str>,
        id_token: &str,
        expires_at: i64,
    ) -> CommandResult<()> {
        let tokens = StoredTokens {
            access_token: access_token.to_string(),
            refresh_token: refresh_token.map(std::string::ToString::to_string),
            id_token: id_token.to_string(),
            expires_at,
        };

        let json = serde_json::to_string(&tokens)
            .map_err(|e| CommandError::Io(format!("failed to serialize tokens: {e}")))?;

        let key = Self::get_or_create_key()?;
        let encrypted = Self::encrypt(json.as_bytes(), &key)?;

        let path = Self::tokens_path()?;
        fs::write(&path, &encrypted)
            .map_err(|e| CommandError::Io(format!("failed to write token file: {e}")))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| {
                CommandError::Io(format!("failed to set token file permissions: {e}"))
            })?;
        }

        tracing::debug!("Tokens stored to encrypted file");
        Ok(())
    }

    pub fn get_tokens() -> CommandResult<Option<StoredTokens>> {
        let path = match Self::tokens_path() {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("Failed to resolve token file path: {e}");
                return Ok(None);
            }
        };

        let encrypted = match fs::read(&path) {
            Ok(data) => data,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                tracing::warn!("Failed to read token file: {e}");
                return Ok(None);
            }
        };

        let key = match Self::get_or_create_key() {
            Ok(k) => k,
            Err(e) => {
                tracing::warn!("Failed to get encryption key: {e}");
                return Ok(None);
            }
        };

        let plaintext = match Self::decrypt(&encrypted, &key) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("Failed to decrypt tokens: {e}");
                return Ok(None);
            }
        };

        let json = String::from_utf8(plaintext).map_err(|e| {
            CommandError::InvalidResponse(format!("Token data is not valid UTF-8: {e}"))
        })?;

        let tokens: StoredTokens = serde_json::from_str(&json).map_err(|e| {
            CommandError::InvalidResponse(format!("Failed to parse stored tokens: {e}"))
        })?;

        Ok(Some(tokens))
    }

    pub fn clear_tokens() -> CommandResult<()> {
        let path = Self::tokens_path()?;
        match fs::remove_file(&path) {
            Ok(()) => tracing::debug!("Token file removed"),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(CommandError::Io(format!(
                    "failed to remove token file: {e}"
                )));
            }
        }

        Ok(())
    }

    pub fn is_expired() -> bool {
        match Self::get_tokens() {
            Ok(Some(tokens)) => {
                let now = chrono::Utc::now().timestamp();
                tokens.expires_at <= now.saturating_add(60)
            }
            _ => true,
        }
    }

    pub fn should_refresh() -> bool {
        match Self::get_tokens() {
            Ok(Some(tokens)) => {
                let now = chrono::Utc::now().timestamp();
                tokens.expires_at <= now.saturating_add(300)
            }
            _ => false,
        }
    }
}
