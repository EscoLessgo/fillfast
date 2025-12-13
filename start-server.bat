@echo off
cd /d %~dp0
echo Stopping any existing server on port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul

echo Starting Frontend (Vite)...
start "ClonesFrontend" /D "%~dp0" cmd /k "npm run dev"

echo Starting Game Server (Node)...
node server.js
