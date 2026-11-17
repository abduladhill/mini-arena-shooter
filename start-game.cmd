@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then open this launcher again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failure
)
call npm run build
if errorlevel 1 goto failure
echo Open http://localhost:3000 in your browser. Keep this window open while playing.
call npm start
exit /b
:failure
echo The game could not start. Review the error above.
pause
exit /b 1
