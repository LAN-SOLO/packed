use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("unknown or unsupported archive format")]
    UnknownFormat,
    #[error("this format can be read but not created: {0}")]
    WriteUnsupported(&'static str),
    #[error("archive is password-protected — a password is required")]
    PasswordRequired,
    #[error("wrong password for this archive")]
    WrongPassword,
    #[error("refusing unsafe path in archive (path traversal): {0}")]
    UnsafePath(String),
    #[error("archive is corrupt or truncated: {0}")]
    Corrupt(String),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;
