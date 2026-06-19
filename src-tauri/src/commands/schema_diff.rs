#[tauri::command]
pub fn prepare_schema_diff(
    options: task_core::schema_diff::SchemaDiffPreparationOptions,
) -> Result<task_core::schema_diff::SchemaDiffPreparation, String> {
    Ok(task_core::schema_diff::prepare_schema_diff(options))
}

#[tauri::command]
pub fn generate_schema_sync_sql(
    diffs: Vec<task_core::schema_diff::TableDiff>,
    function_diffs: Option<Vec<task_core::schema_diff::FunctionDiff>>,
    sequence_diffs: Option<Vec<task_core::schema_diff::SequenceDiff>>,
    rule_diffs: Option<Vec<task_core::schema_diff::RuleDiff>>,
    owner_diffs: Option<Vec<task_core::schema_diff::OwnerDiff>>,
    database_type: task_core::models::connection::DatabaseType,
    target_schema: Option<String>,
    cascade_delete: Option<bool>,
) -> Result<String, String> {
    Ok(task_core::schema_diff::generate_schema_sync_sql(
        &diffs,
        function_diffs.as_deref().unwrap_or_default(),
        sequence_diffs.as_deref().unwrap_or_default(),
        rule_diffs.as_deref().unwrap_or_default(),
        owner_diffs.as_deref().unwrap_or_default(),
        database_type,
        target_schema.as_deref(),
        cascade_delete.unwrap_or(false),
    ))
}
