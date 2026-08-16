@echo off
setlocal
cd /d "%~dp0"

if not exist "gradlew.bat" (
    echo gradlew.bat not found. Please add the Gradle wrapper.
    exit /b 1
)

echo Cleaning and building debug APK...
call gradlew.bat clean :app:assembleDebug
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo Build succeeded.
echo APK: app\build\outputs\apk\debug\app-debug.apk
