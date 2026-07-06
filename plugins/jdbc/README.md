# TASK JDBC Plugin Prototype

This is an optional sidecar plugin for TASK. It is not bundled with the main TASK app.

## Build

```sh
mvn -q -DskipTests package
mkdir -p lib
cp target/task-jdbc-plugin-*-all.jar lib/task-jdbc-plugin.jar
```

## Package for release

```sh
./package.sh
```

The package version follows the JDBC plugin version in `pom.xml` and `manifest.json`.
The package script writes both `task-jdbc-plugin-<version>.zip` and `task-jdbc-plugin-latest.zip`.

## Install for local TASK

Copy this folder to the TASK app data plugin directory:

```text
<TASK app data>/plugins/jdbc
```

The folder must contain:

```text
manifest.json
bin/task-jdbc-plugin
lib/task-jdbc-plugin.jar
```

TASK does not bundle Java or JDBC drivers. Install Java locally and add database-specific driver JAR paths in the TASK JDBC connection form.
