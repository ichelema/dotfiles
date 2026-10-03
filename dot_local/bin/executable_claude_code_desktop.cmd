@echo off

set DISABLE_TELEMETRY=1
set DO_NOT_TRACK=1
set CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1

set ANTHROPIC_API_KEY=
set ANTHROPIC_AUTH_TOKEN=
set CLAUDE_CODE_OAUTH_TOKEN=

rem Terminal
set TERM=xterm-256color

rem MSYS2
set COLORTERM=truecolor
set LANG=en_US.UTF-8
set LC_ALL=en_US.UTF-8
set PYTHONUTF8=1

set MSYSTEM=UCRT64
set CHERE_INVOKING=1
set MSYS2_PATH_TYPE=strict

set HOME=E:\msys64\home\Sphynx
set CLAUDE_CONFIG_DIR=E:\msys64\home\Sphynx\.claude
set CLAUDE_CODE_GIT_BASH_PATH=E:\msys64\usr\bin\bash.exe

rem CLAUDE_ENV_FILE definito in .claude/settings.json (env), non qui

set PATH=E:\msys64\ucrt64\bin;E:\msys64\usr\local\bin;E:\msys64\usr\bin;E:\msys64\bin;E:\msys64\home\Sphynx\.local\bin;E:\msys64\home\Sphynx\.local\bin\lua-language-server\bin;C:\Windows\System32\WindowsPowerShell\v1.0;C:\Windows\System32;C:\Windows

rem --- risoluzione path Claude Desktop (classico oppure Store/MSIX) ---
set "CLAUDE_EXE=C:\Users\en27553\AppData\Local\AnthropicClaude\claude.exe"
if exist "%CLAUDE_EXE%" goto :launch
for /f "delims=" %%i in ('powershell -NoProfile -Command "@(Get-AppxPackage -Name *Claude*)[0].InstallLocation"') do set "CLAUDE_EXE=%%i\app\claude.exe"
:launch
start "" /D "E:\AI\Claude\Trinity" "%CLAUDE_EXE%"
