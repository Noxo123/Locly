@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo [Locly] Installation des dependances...
  call npm install
  if errorlevel 1 exit /b 1
)
if "%JWT_SECRET%"=="" set JWT_SECRET=locly-local-dev-secret
if "%PORT%"=="" set PORT=3000
 echo.
echo ========================================
echo            LOCly - DEV SERVER
echo ========================================
echo.
echo URL: http://localhost:%PORT%
echo.
call npm start
