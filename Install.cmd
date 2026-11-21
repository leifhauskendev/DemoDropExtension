@echo off
title DemoDrop installer
echo Installing DemoDrop...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
  echo.
  echo Something went wrong - see the message above.
)
echo.
pause
