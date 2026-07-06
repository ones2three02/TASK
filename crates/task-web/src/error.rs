use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

#[derive(Debug, Clone)]
pub struct AppError {
    pub message: String,
    pub status: StatusCode,
}

#[allow(dead_code)]
impl AppError {
    pub fn internal(msg: impl Into<String>) -> Self {
        AppError { message: msg.into(), status: StatusCode::INTERNAL_SERVER_ERROR }
    }

    pub fn bad_request(msg: impl Into<String>) -> Self {
        AppError { message: msg.into(), status: StatusCode::BAD_REQUEST }
    }

    pub fn unauthorized(msg: impl Into<String>) -> Self {
        AppError { message: msg.into(), status: StatusCode::UNAUTHORIZED }
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        AppError { message: msg.into(), status: StatusCode::FORBIDDEN }
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        AppError { message: msg.into(), status: StatusCode::NOT_FOUND }
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if self.status == StatusCode::INTERNAL_SERVER_ERROR {
            tracing::error!("Internal server error: {}", self.message);
        } else {
            tracing::warn!("Client error ({}): {}", self.status, self.message);
        }

        let body = axum::Json(ErrorResponse { message: self.message });
        (self.status, body).into_response()
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError { message: s, status: StatusCode::INTERNAL_SERVER_ERROR }
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError { message: s.to_string(), status: StatusCode::INTERNAL_SERVER_ERROR }
    }
}
