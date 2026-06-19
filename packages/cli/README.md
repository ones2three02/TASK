# TASK CLI

Command line interface for TASK database connections, schema inspection, safe queries, and prompt-ready schema context.

## Install

### npm

```bash
npm install -g @task-app/cli
```

### Homebrew

```bash
brew tap ones2three02/TASK
brew install task-cli
```

Requires Node.js 22.13.0 or newer.

## Usage

```bash
task doctor
task capabilities
task connections list --json
task connections list --format csv
task schema list local --json
task schema describe local users --json
task query local "select count(*) as total from users" --json
task query local "select id, name from users" --format csv
task query local "select * from users" --limit 50 --timeout 10s --json
task query local --file ./query.sql --json
task context local --tables users,orders
task open local users
```

## Commands

| Command                                     | Description                                           |
| ------------------------------------------- | ----------------------------------------------------- |
| `task doctor`                                | Show local TASK config and desktop bridge diagnostics  |
| `task capabilities`                          | Show direct-query and desktop-bridge database support |
| `task connections list`                      | List TASK connections without printing secrets         |
| `task schema list <connection>`              | List tables and views                                 |
| `task schema describe <connection> <table>`  | Show table columns                                    |
| `task query <connection> <sql>`              | Execute one SQL statement                             |
| `task query <connection> --file ./query.sql` | Execute SQL from a file                               |
| `task context <connection>`                  | Print compact schema context for prompts              |
| `task open <connection> <table>`             | Open a table in TASK Desktop                           |

## Output

Use `--json` or `--format json` for stable machine-readable output. Use `--format csv` for query, connection, and schema data that should be piped into other command line tools.

Errors are written to stderr and return a non-zero exit code.

## Query Controls

`task query` is read-only by default.

Use `--limit <n>` to control returned query rows and `--timeout <duration>` to control query timeout. Durations accept `ms`, `s`, or `m`, such as `500ms`, `10s`, or `1m`.

Use `--allow-writes` for non-dangerous write statements. Dangerous SQL such as `DROP`, `TRUNCATE`, and `ALTER` requires both `--allow-writes` and `--allow-dangerous-sql`.

For SQL that starts with a dash, pass `--` before the SQL:

```bash
task query local --json -- "-- comment
select 1"
```

## Default Connection

Set `TASK_CONNECTION` to omit the connection name for query and context commands:

```bash
TASK_CONNECTION=local task query "select 1" --json
TASK_CONNECTION=local task context --tables users,orders
```

## Desktop App Requirements

Some CLI commands can run without TASK Desktop:

- `connections list`
- `schema list`
- `schema describe`
- `query`
- `context`

Direct execution currently supports PostgreSQL/Redshift, MySQL-compatible databases (MySQL, Doris, StarRocks), and SQLite. Other database types use the TASK Desktop bridge until their drivers are added to `@task-app/node-core`.

Use `task doctor` to check whether the TASK connection database, connection table, native SQLite loader, and desktop bridge are available. Use `task capabilities` to list direct-query and bridge-required database types.

If `task doctor` reports a `NODE_MODULE_VERSION` mismatch after switching Node.js versions, rebuild the native dependencies with the Node.js version you use to run `task`:

```bash
pnpm rebuild better-sqlite3 keytar --pending
```

For global npm installs, reinstall the CLI with the same Node.js version:

```bash
npm uninstall -g @task-app/cli
npm install -g @task-app/cli
```

## Error Codes

CLI JSON errors use stable codes:

| Code                     | Meaning                                             |
| ------------------------ | --------------------------------------------------- |
| `UNKNOWN_OPTION`         | An unsupported flag was provided                    |
| `INVALID_OPTION`         | A flag is missing a value or has an invalid value   |
| `INVALID_ARGUMENT`       | Positional arguments are missing or conflicting     |
| `CONNECTION_STORE_ERROR` | TASK connection storage exists but could not be read |
| `CONNECTION_NOT_FOUND`   | No TASK connection matched the requested name        |
| `SQL_BLOCKED`            | SQL safety rules blocked execution                  |
| `TASK_NOT_RUNNING`        | TASK Desktop bridge is unavailable                   |
| `ERROR`                  | Unexpected runtime failure                          |

## Codex

Codex can call the CLI directly from shell tools:

```bash
task schema describe local users --json
task context local --tables users,orders | codex exec "Write a retention query"
```
