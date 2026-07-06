# TASK MCP Server

MCP server for [TASK](https://github.com/ones2three02/TASK) — lets AI agents (Claude Code, Cursor, etc.) query your databases using connections already configured in TASK.

[中文](#中文说明) | English

## Features

- **Zero config** — Automatically reads your TASK connections (including passwords from system keyring)
- **8 tools** — List/add/remove connections, list tables, describe table, get schema context, execute SQL, open table in TASK UI
- **Connection pooling** — Reuses database connections across queries
- **Direct execution** — PostgreSQL, MySQL, SQLite, and compatible databases (Doris, StarRocks, etc.) can run without opening TASK
- **Writes enabled by default** — regular `INSERT` / `UPDATE` / `DELETE` statements work out of the box, while dangerous SQL stays blocked unless explicitly enabled
- **TASK UI integration** — Open tables directly in the TASK desktop app from your AI agent

## Quick Start

### 1. Install

```bash
npm install -g @task-app/mcp-server
```

Or run directly:

```bash
npx @task-app/mcp-server
```

### 2. Configure Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "task": {
      "command": "task-mcp-server"
    }
  }
}
```

Or for development (from source):

```json
{
  "mcpServers": {
    "task": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"],
      "cwd": "/path/to/task"
    }
  }
}
```

### 3. Use

In Claude Code, just ask:

- "List my database connections"
- "Show the tables in my local-pg connection"
- "Describe the users table"
- "Query the average salary from employees"
- "Open the orders table in TASK"

## CLI

For terminal, script, and Codex workflows, install the dedicated CLI package:

```bash
npm install -g @task-app/cli
task connections list --json
task query local "select 1" --json
```

See the [TASK CLI README](../cli/README.md) for command details.

## Tools

| Tool                     | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `task_list_connections`   | List all database connections configured in TASK      |
| `task_add_connection`     | Add a new database connection                        |
| `task_remove_connection`  | Remove a database connection                         |
| `task_list_tables`        | List tables and views for a connection               |
| `task_describe_table`     | Get column definitions for a table                   |
| `task_get_schema_context` | Get compact table and column context for writing SQL |
| `task_execute_query`      | Execute a SQL query (max 100 rows)                   |
| `task_open_table`         | Open a table in TASK desktop app UI                   |

## SQL Safety

`task_execute_query` accepts multiple SQL statements and executes them one at a time after checking each statement. Regular write statements such as `INSERT`, `UPDATE`, and `DELETE ... WHERE ...` are allowed by default.

If you need to force a read-only MCP session, set:

```bash
TASK_MCP_ALLOW_WRITES=0
```

Dangerous statements such as `DROP`, `TRUNCATE`, and `ALTER` remain blocked unless you also set:

```bash
TASK_MCP_ALLOW_DANGEROUS_SQL=1
```

## How It Works

```
AI Agent → MCP Server → Database
                ↓
         TASK SQLite database (task.db)
```

The MCP server reads your database connections from TASK's SQLite database:

- **macOS**: `~/Library/Application Support/com.task.app/task.db`
- **Linux**: `~/.config/com.task.app/task.db`
- **Windows**: `%APPDATA%\com.task.app\task.db`

## TASK UI Integration

The `task_open_table` tool communicates with the running TASK app to open tables directly in the UI. This requires TASK to be running. If TASK is not running, the tool will return an error message.

PostgreSQL, MySQL, SQLite, Doris, StarRocks, and Redshift queries run directly from the MCP server. Other database types still use the TASK desktop bridge for query, table, and column operations unless `TASK_WEB_URL` is configured.

## Requirements

- [TASK](https://github.com/ones2three02/TASK) installed with at least one connection configured
- Node.js 22.13.0 或更高版本

## License

Apache-2.0

---

## 中文说明

[TASK](https://github.com/ones2three02/TASK) 的 MCP Server，让 AI 编程助手（Claude Code、Cursor 等）直接使用 TASK 中已配置的数据库连接查询数据。

### 特性

- **零配置** — 自动读取 TASK 的连接配置
- **8 个工具** — 列出/添加/删除连接、列出表、查看表结构、获取 Schema 上下文、执行 SQL、在 TASK 中打开表
- **连接池** — 跨查询复用数据库连接
- **直接执行** — PostgreSQL、MySQL、SQLite 及兼容数据库（Doris、StarRocks 等）无需打开 TASK 即可查询
- **默认允许常规写入** — `INSERT` / `UPDATE` / `DELETE` 可直接执行，危险语句仍需显式开启
- **TASK UI 联动** — 从 AI 助手直接在 TASK 桌面端打开表

### 快速开始

#### 1. 安装

```bash
npm install -g @task-app/mcp-server
```

或直接运行：

```bash
npx @task-app/mcp-server
```

#### 2. 配置 Claude Code

在项目的 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "task": {
      "command": "task-mcp-server"
    }
  }
}
```

#### 3. 使用

在 Claude Code 中直接说：

- "列出我的数据库连接"
- "查看 local-pg 上有哪些表"
- "查看 users 表的结构"
- "查询最近 7 天的订单数量"
- "打开 orders 表"

### CLI

终端、脚本和 Codex 工作流请安装独立 CLI 包：

```bash
npm install -g @task-app/cli
task connections list --json
task query local "select 1" --json
```

命令详情见 [TASK CLI README](../cli/README.md)。

### 工具列表

| 工具                     | 说明                                  |
| ------------------------ | ------------------------------------- |
| `task_list_connections`   | 列出 TASK 中所有已配置的数据库连接     |
| `task_add_connection`     | 添加新的数据库连接                    |
| `task_remove_connection`  | 删除数据库连接                        |
| `task_list_tables`        | 列出指定连接的表和视图                |
| `task_describe_table`     | 获取表的列定义                        |
| `task_get_schema_context` | 获取适合 AI 写 SQL 的紧凑表结构上下文 |
| `task_execute_query`      | 执行 SQL 查询（最多返回 100 行）      |
| `task_open_table`         | 在 TASK 桌面端打开指定表               |

### SQL 安全

`task_execute_query` 支持多条 SQL 语句，会逐条完成安全检查并依次执行。默认允许常规写操作，例如 `INSERT`、`UPDATE`、`DELETE ... WHERE ...`。

如果你希望 MCP 会话强制退回只读，可设置：

```bash
TASK_MCP_ALLOW_WRITES=0
```

`DROP`、`TRUNCATE`、`ALTER` 等危险语句仍会被拦截，除非额外设置：

```bash
TASK_MCP_ALLOW_DANGEROUS_SQL=1
```

### 工作原理

MCP Server 从 TASK 的 SQLite 数据库读取连接信息：

- **macOS**: `~/Library/Application Support/com.task.app/task.db`
- **Linux**: `~/.config/com.task.app/task.db`
- **Windows**: `%APPDATA%\com.task.app\task.db`

### TASK UI 联动

`task_open_table` 工具通过本地 HTTP 接口与运行中的 TASK 应用通信，直接在 UI 中打开表。需要 TASK 正在运行。

PostgreSQL、MySQL、SQLite、Doris、StarRocks、Redshift 查询可由 MCP Server 直接执行。其他数据库类型的查询、表列表、字段读取仍会走 TASK 桌面端 bridge，除非配置了 `TASK_WEB_URL` 使用 Web 后端。

### 系统要求

- 已安装 [TASK](https://github.com/ones2three02/TASK) 并配置了至少一个数据库连接
- Node.js 22.13.0 or newer
