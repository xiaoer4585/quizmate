@echo off
setlocal
cd /d "%~dp0"

set APK=app\build\outputs\apk\debug\app-debug.apk

if not exist "%APK%" (
    echo APK not found. Building first...
    call build_android.bat
    if errorlevel 1 exit /b 1
)

echo Installing to connected device...
adb install -r "%APK%"
if errorlevel 1 (
    echo Install failed. Make sure adb is on PATH and a device is connected.
    exit /b 1
)

echo Install succeeded.
