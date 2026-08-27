# 从 GitHub Releases 元数据下载测试包到本地归档目录，按 size+SHA256 校验
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WinJson = 'E:\ai项目\考试插件\其他\部署工具\.win-assets.json'
$MacJson = 'E:\ai项目\考试插件\其他\部署工具\.mac-assets.json'

function Parse($Path) {
  (Get-Content $Path -Raw | ConvertFrom-Json).assets
}

function MetaFor($Assets, [string[]]$Names) {
  foreach ($a in $Assets) {
    if ($Names -contains $a.name) {
      $sha = ($a.digest -replace '^sha256:', '').ToLower()
      return [pscustomobject]@{ Name = $a.name; Size = [int64]$a.size; Sha256 = $sha; Url = $a.url }
    }
  }
  return $null
}

function Verify-Local($Path, $Meta) {
  if (-not (Test-Path $Path)) { return $false }
  $len = (Get-Item $Path).Length
  if ($len -ne $Meta.Size) { return $false }
  $hash = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLower()
  if ($hash -ne $Meta.Sha256) { return $false }
  return $true
}

function Download-With($Meta, $Dir) {
  if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
  $dest = Join-Path $Dir $Meta.Name
  if (Verify-Local $dest $Meta) {
    Write-Host ("SKIP_OK  {0,-40} size={1}" -f $Meta.Name, $Meta.Size)
    return
  }
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    Write-Host ("ATTEMPT  {0,-40} try={1}" -f $Meta.Name, $attempt)
    try {
      Remove-Item $dest -Force -ErrorAction SilentlyContinue
      Invoke-WebRequest -UseBasicParsing -Uri $Meta.Url -OutFile $dest -TimeoutSec 1500 -Headers @{ 'User-Agent' = 'PowerShell-QuizMateTest/1.0' }
      if (Verify-Local $dest $Meta) {
        Write-Host ("DOWNLOAD_OK {0,-40} size={1}" -f $Meta.Name, $Meta.Size)
        return
      } else {
        $len = if (Test-Path $dest) { (Get-Item $dest).Length } else { 0 }
        Write-Host ("MISMATCH {0,-40} got={1} expected={2}" -f $Meta.Name, $len, $Meta.Size)
      }
    } catch {
      Write-Host ("ERR {0,-40} {1}" -f $Meta.Name, $_.Exception.Message)
    }
    Start-Sleep -Seconds 8
  }
  throw "FAILED $($Meta.Name)"
}

$Win = Parse $WinJson
$Mac = Parse $MacJson

Download-With (MetaFor $Win @('QuizMate-Windows-2026.8.28.exe'))             'E:\ai项目\考试插件\windows客户端\QuizMate-Windows\releases\2026-08-28-test'
Download-With (MetaFor $Mac @('QuizMate-Mac-arm64-2026.8.28.dmg'))           'E:\ai项目\考试插件\mac客户端\QuizMate-Mac\releases\2026-08-28-test'
Download-With (MetaFor $Mac @('QuizMate-Mac-x64-2026.8.28.dmg'))             'E:\ai项目\考试插件\mac客户端\QuizMate-Mac\releases\2026-08-28-test'
Download-With (MetaFor $Mac @('QuizMate-2026.8.28-arm64-mac.zip'))           'E:\ai项目\考试插件\mac客户端\QuizMate-Mac\releases\2026-08-28-test'
Download-With (MetaFor $Mac @('QuizMate-2026.8.28-mac.zip'))                 'E:\ai项目\考试插件\mac客户端\QuizMate-Mac\releases\2026-08-28-test'

Write-Host 'ALL_FILES_OK'