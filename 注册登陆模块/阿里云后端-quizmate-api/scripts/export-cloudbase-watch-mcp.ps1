param(
  [string]$OutputPath = ".tmp/cloudbase-watch-export.json",
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
}
$collections = @(
  "watch_packages",
  "watch_sources",
  "watch_subscriptions",
  "watch_user_intents",
  "watch_jobs",
  "watch_source_snapshots",
  "watch_source_changes",
  "watch_site_sessions",
  "watch_applications",
  "watch_application_events"
)

$data = [ordered]@{}
Push-Location -LiteralPath $ProjectRoot
try {
  foreach ($collection in $collections) {
    $raw = npx --yes mcporter call cloudbase.readNoSqlDatabaseContent "collectionName=$collection" limit=1000 | Out-String
    $start = $raw.IndexOf("{")
    $end = $raw.LastIndexOf("}")
    if ($start -lt 0 -or $end -lt $start) { throw "CloudBase export returned invalid JSON for $collection" }
    $response = $raw.Substring($start, $end - $start + 1) | ConvertFrom-Json
    if (-not $response.success) { throw "CloudBase export failed for $collection" }
    $data[$collection] = @($response.data)
  }
} finally {
  Pop-Location
}

$payload = [ordered]@{
  format = "quizmate-cloudbase-watch-export-v1"
  envId = "cuolemo-d4g2lqdczd74e3ae5"
  exportedAt = [DateTime]::UtcNow.ToString("o")
  collections = $data
}

$absolute = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolute)) | Out-Null
[IO.File]::WriteAllText($absolute, ($payload | ConvertTo-Json -Depth 100 -Compress), [Text.UTF8Encoding]::new($false))

$counts = [ordered]@{}
foreach ($collection in $collections) { $counts[$collection] = @($data[$collection]).Count }
$counts | ConvertTo-Json -Compress
