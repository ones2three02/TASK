# TASK Node Core

Shared Node.js runtime utilities for TASK CLI and TASK MCP Server.

This package reads TASK Desktop connection storage, redacts connection summaries, builds schema context, applies SQL safety rules, and executes supported direct database queries.

## Supported Runtime

Requires Node.js 22.13.0 or newer.

## Direct Query Support

Direct execution currently supports:

- PostgreSQL and Redshift
- MySQL-compatible databases, including MySQL, Doris, and StarRocks
- SQLite

Other TASK connection types can be routed through TASK Desktop bridge integrations used by the CLI and MCP server.

## Public Modules

```ts
import { createBackend, loadConnections, getTaskDiagnostics, evaluateSqlSafety, buildSchemaContext } from "@task-app/node-core";
```

The package is intended as a shared implementation layer for official TASK Node packages. Applications should prefer `@task-app/cli` for terminal workflows and `@task-app/mcp-server` for MCP clients.
