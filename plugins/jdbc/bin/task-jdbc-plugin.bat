@echo off
setlocal

if defined TASK_JAVA_BIN (
    if exist "%TASK_JAVA_BIN%" (
        set "JAVA_BIN=%TASK_JAVA_BIN%"
        goto :run
    )
)

if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\java.exe" (
        set "JAVA_BIN=%JAVA_HOME%\bin\java.exe"
        goto :run
    )
)

where java >nul 2>nul
if %errorlevel% equ 0 (
    java -version >nul 2>nul
    if %errorlevel% equ 0 (
        set "JAVA_BIN=java"
        goto :run
    )
)

echo Java runtime not found. Install Java or the optional TASK JDBC runtime. >&2
exit /b 127

:run
"%JAVA_BIN%" -Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8 -jar "%~dp0..\lib\task-jdbc-plugin.jar"
