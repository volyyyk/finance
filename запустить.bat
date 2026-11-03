@echo off
title Finance
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel% equ 0 goto :have_py

where python >nul 2>nul
if %errorlevel% equ 0 goto :have_python

where python3 >nul 2>nul
if %errorlevel% equ 0 goto :have_python3

echo.
echo ============================================================
echo  Python 3 not found on this system.
echo.
echo  Install it from:
echo    https://www.python.org/downloads/
echo.
echo  IMPORTANT: during installation check the box
echo    [x] Add Python to PATH
echo ============================================================
echo.
pause
exit /b 1

:have_py
py -3 start.py
exit /b %errorlevel%

:have_python
python start.py
exit /b %errorlevel%

:have_python3
python3 start.py
exit /b %errorlevel%