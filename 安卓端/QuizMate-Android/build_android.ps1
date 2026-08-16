param([switch]$SkipSdkInstall)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tools = Join-Path $Root "tools"
$Release = Join-Path $Root "release"
$JdkDir = Join-Path $Tools "jdk17"
$GradleDir = Join-Path $Tools "gradle-8.10.2"
$SdkDir = Join-Path $Tools "android-sdk"
$CmdlineDir = Join-Path $SdkDir "cmdline-tools\latest"
$LocalProperties = Join-Path $Root "local.properties"

New-Item -ItemType Directory -Force -Path $Tools, $Release | Out-Null

function Download-File($Url, $OutFile) {
    if (Test-Path $OutFile) {
        $existing = Get-Item $OutFile
        if ($existing.Length -gt 10MB) { return }
        Remove-Item -Force $OutFile
    }
    $tempOut = "$OutFile.partial"
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        for ($attempt = 1; $attempt -le 20; $attempt++) {
            Write-Host "Downloading $Url (attempt $attempt)"
            & $curl.Source -L --fail -C - --retry 5 --retry-delay 3 -o $tempOut $Url
            if ($LASTEXITCODE -eq 0) { break }
            if ($attempt -eq 20) { throw "Download failed: $Url" }
            Start-Sleep -Seconds 3
        }
    } else {
        Invoke-WebRequest -Uri $Url -OutFile $tempOut -UseBasicParsing
    }
    Move-Item -Force -Path $tempOut -Destination $OutFile
}

function Expand-Fresh($Zip, $Destination) {
    if (Test-Path $Destination) { Remove-Item -Recurse -Force $Destination }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $Zip -DestinationPath $Destination -Force
}

function Test-SdkReady {
    return (
        (Test-Path (Join-Path $SdkDir "platform-tools\adb.exe")) -and
        (Test-Path (Join-Path $SdkDir "platforms\android-35\android.jar")) -and
        (Test-Path (Join-Path $SdkDir "build-tools\35.0.0\aapt2.exe"))
    )
}

# JDK
if (-not (Test-Path (Join-Path $JdkDir "bin\java.exe"))) {
    $jdkZip = Join-Path $Tools "microsoft-jdk17.zip"
    Download-File "https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip" $jdkZip
    $tmp = Join-Path $Tools "jdk_tmp"
    Expand-Fresh $jdkZip $tmp
    $expanded = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    Move-Item -Path $expanded.FullName -Destination $JdkDir
    Remove-Item -Recurse -Force $tmp
}

# Gradle
if (-not (Test-Path (Join-Path $GradleDir "bin\gradle.bat"))) {
    $gradleZip = Join-Path $Tools "gradle-8.10.2-bin.zip"
    Download-File "https://mirrors.cloud.tencent.com/gradle/gradle-8.10.2-bin.zip" $gradleZip
    $tmp = Join-Path $Tools "gradle_tmp"
    Expand-Fresh $gradleZip $tmp
    Move-Item -Path (Join-Path $tmp "gradle-8.10.2") -Destination $GradleDir
    Remove-Item -Recurse -Force $tmp
}

# Android SDK
if (-not (Test-SdkReady) -and -not (Test-Path (Join-Path $CmdlineDir "bin\sdkmanager.bat"))) {
    $cmdlineZip = Join-Path $Tools "commandlinetools.zip"
    Download-File "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" $cmdlineZip
    $tmp = Join-Path $Tools "cmdline_tmp"
    Expand-Fresh $cmdlineZip $tmp
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CmdlineDir) | Out-Null
    Move-Item -Path (Join-Path $tmp "cmdline-tools") -Destination $CmdlineDir
    Remove-Item -Recurse -Force $tmp
}

$env:JAVA_HOME = $JdkDir
$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir
$env:Path = "$(Join-Path $JdkDir 'bin');$(Join-Path $GradleDir 'bin');$(Join-Path $SdkDir 'platform-tools');$env:Path"

$sdkManager = Join-Path $CmdlineDir "bin\sdkmanager.bat"
if (-not $SkipSdkInstall -and -not (Test-SdkReady)) {
    if (Test-Path $sdkManager) {
        Write-Host "Installing Android SDK packages..."
        $yes = ("y`n" * 80)
        $yes | & $sdkManager --sdk_root=$SdkDir --licenses | Out-Null
        & $sdkManager --sdk_root=$SdkDir "platform-tools" "platforms;android-35" "build-tools;35.0.0"
    }
}

$escapedSdk = $SdkDir.Replace("\", "\\")
Set-Content -Path $LocalProperties -Value "sdk.dir=$escapedSdk" -Encoding ASCII

Write-Host "Building QuizMate APK..."
& (Join-Path $GradleDir "bin\gradle.bat") -p $Root clean assembleDebug

$apk = Join-Path $Root "app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    $target = Join-Path $Release "QuizMate-debug.apk"
    Copy-Item -LiteralPath $apk -Destination $target -Force
    $size = [math]::Round((Get-Item $target).Length/1KB, 1)
    Write-Host "APK ready: $target ($size KB)"
} else {
    throw "APK was not generated"
}
