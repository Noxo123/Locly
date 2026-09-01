@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo [Locly] Installation des dependances...
  call npm install
  if errorlevel 1 exit /b 1
)
if "%JWT_SECRET%"=="" set JWT_SECRET=locly-local-dev-secret-change-me
if "%PORT%"=="" set PORT=3000
if "%ADMIN_PORT%"=="" set ADMIN_PORT=3001
if not exist data mkdir data

echo.
echo ========================================
echo          LOCly - DEV SERVER + ADMIN
echo ========================================
echo.
echo Marketplace : http://localhost:%PORT%
echo Admin       : http://localhost:%PORT%/admin.html
echo Admin API   : http://localhost:%ADMIN_PORT%
echo.
start "Locly Admin API" cmd /k "set JWT_SECRET=%JWT_SECRET%&& set ADMIN_PORT=%ADMIN_PORT%&& node admin-api.js"
call npm start
