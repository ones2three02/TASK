#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VERSION="$(grep -m1 '<version>' "$ROOT/pom.xml" | sed -E 's/.*<version>([^<]+)<.*/\1/')"
PACKAGE_DIR="$ROOT/dist/task-jdbc-plugin-$VERSION"
ZIP_PATH="$ROOT/dist/task-jdbc-plugin-$VERSION.zip"
LATEST_ZIP_PATH="$ROOT/dist/task-jdbc-plugin-latest.zip"

cd "$ROOT"
mvn -q -DskipTests package

rm -rf "$PACKAGE_DIR" "$ZIP_PATH" "$LATEST_ZIP_PATH"
mkdir -p "$PACKAGE_DIR/bin" "$PACKAGE_DIR/lib"
cp "$ROOT/manifest.json" "$PACKAGE_DIR/manifest.json"
cp "$ROOT/bin/task-jdbc-plugin" "$PACKAGE_DIR/bin/task-jdbc-plugin"
cp "$ROOT/bin/task-jdbc-plugin.bat" "$PACKAGE_DIR/bin/task-jdbc-plugin.bat"
cp "$ROOT/bin/task-maven-resolver" "$PACKAGE_DIR/bin/task-maven-resolver"
cp "$ROOT/bin/task-maven-resolver.bat" "$PACKAGE_DIR/bin/task-maven-resolver.bat"
cp "$ROOT/target/task-jdbc-plugin-$VERSION-all.jar" "$PACKAGE_DIR/lib/task-jdbc-plugin.jar"
chmod +x "$PACKAGE_DIR/bin/task-jdbc-plugin"
chmod +x "$PACKAGE_DIR/bin/task-maven-resolver"

(cd "$ROOT/dist" && zip -qr "task-jdbc-plugin-$VERSION.zip" "task-jdbc-plugin-$VERSION")
cp "$ZIP_PATH" "$LATEST_ZIP_PATH"
echo "$ZIP_PATH"
echo "$LATEST_ZIP_PATH"
