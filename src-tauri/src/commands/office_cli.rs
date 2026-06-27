use std::process::Command;

#[tauri::command]
pub async fn run_office_cli(cmd: String, args: Vec<String>) -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();

    // Auto-detect Volta, nvm, and typical user path locations
    let volta_bin = format!("{}/.volta/bin", home);
    let nvm_bin = format!("{}/.nvm/versions/node/v22.13.0/bin", home);
    let local_bin = format!("{}/.local/bin", home);
    let npm_bin = format!("{}/.npm-global/bin", home);

    let mut path_env = std::env::var("PATH").unwrap_or_default();

    // Prepend standard tool paths to PATH to ensure terminal environment compatibility
    if !path_env.contains(&volta_bin) {
        path_env = format!("{}:{}", volta_bin, path_env);
    }
    if !path_env.contains(&nvm_bin) {
        path_env = format!("{}:{}", nvm_bin, path_env);
    }
    if !path_env.contains(&local_bin) {
        path_env = format!("{}:{}", local_bin, path_env);
    }
    if !path_env.contains(&npm_bin) {
        path_env = format!("{}:{}", npm_bin, path_env);
    }

    // Also add typical macOS homebrew paths
    let homebrew_bin = "/opt/homebrew/bin:/usr/local/bin";
    if !path_env.contains("/opt/homebrew/bin") {
        path_env = format!("{}:{}", homebrew_bin, path_env);
    }

    let mut child = Command::new(&cmd);
    child.args(&args);
    child.env("PATH", path_env);

    match child.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                let err_str = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if err_str.is_empty() {
                    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
                } else {
                    Err(err_str)
                }
            }
        }
        Err(e) => Err(format!("Command execution failed: {}", e)),
    }
}
