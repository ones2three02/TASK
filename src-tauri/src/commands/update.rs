pub use task_core::update::UpdateInfo;

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let release = task_core::update::fetch_latest_release().await?;
    let current_version = env!("CARGO_PKG_VERSION");
    let mut info = task_core::update::build_update_info(release, current_version);
    info.portable_mode = crate::data_dir::is_portable_mode();
    Ok(info)
}

#[tauri::command]
pub async fn get_system_proxy_url() -> Option<String> {
    tauri::async_runtime::spawn_blocking(task_core::update::system_proxy_url).await.ok().flatten()
}
