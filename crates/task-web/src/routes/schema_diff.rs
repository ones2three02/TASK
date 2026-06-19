use axum::Json;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSchemaSyncSqlRequest {
    pub diffs: Vec<task_core::schema_diff::TableDiff>,
    pub function_diffs: Option<Vec<task_core::schema_diff::FunctionDiff>>,
    pub sequence_diffs: Option<Vec<task_core::schema_diff::SequenceDiff>>,
    pub rule_diffs: Option<Vec<task_core::schema_diff::RuleDiff>>,
    pub owner_diffs: Option<Vec<task_core::schema_diff::OwnerDiff>>,
    pub database_type: task_core::models::connection::DatabaseType,
    pub target_schema: Option<String>,
    pub cascade_delete: Option<bool>,
}

pub async fn prepare_schema_diff(
    Json(options): Json<task_core::schema_diff::SchemaDiffPreparationOptions>,
) -> Json<task_core::schema_diff::SchemaDiffPreparation> {
    Json(task_core::schema_diff::prepare_schema_diff(options))
}

pub async fn generate_schema_sync_sql(Json(req): Json<GenerateSchemaSyncSqlRequest>) -> Json<String> {
    Json(task_core::schema_diff::generate_schema_sync_sql(
        &req.diffs,
        req.function_diffs.as_deref().unwrap_or_default(),
        req.sequence_diffs.as_deref().unwrap_or_default(),
        req.rule_diffs.as_deref().unwrap_or_default(),
        req.owner_diffs.as_deref().unwrap_or_default(),
        req.database_type,
        req.target_schema.as_deref(),
        req.cascade_delete.unwrap_or(false),
    ))
}
