use axum::Json;
use serde::Serialize;
use task_core::update;
use utoipa::ToSchema;

use crate::error::AppError;

#[derive(Serialize, ToSchema)]
pub struct VersionResponse {
    pub version: &'static str,
}

#[derive(Serialize, ToSchema)]
pub struct UpdateInfoSchema {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub platform_available: bool,
    pub portable_mode: bool,
    pub release_name: String,
    pub release_url: String,
    pub release_notes: String,
}

#[utoipa::path(
    method(get),
    path = "/api/version",
    responses(
        (status = 200, description = "Get current application version", body = VersionResponse)
    )
)]
pub async fn get_version() -> Json<VersionResponse> {
    Json(VersionResponse { version: env!("CARGO_PKG_VERSION") })
}

#[utoipa::path(
    method(get),
    path = "/api/update/check",
    responses(
        (status = 200, description = "Check for available application updates", body = UpdateInfoSchema),
        (status = 500, description = "Failed to fetch updates", body = String)
    )
)]
pub async fn check_for_updates() -> Result<Json<serde_json::Value>, AppError> {
    let release = update::fetch_latest_release().await.map_err(AppError::internal)?;
    let info = update::build_update_info(release, env!("CARGO_PKG_VERSION"));
    Ok(Json(serde_json::to_value(info).map_err(|e| AppError::internal(e.to_string()))?))
}
