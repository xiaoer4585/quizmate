param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$normalizedInstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$targetPaths = @(
  [IO.Path]::Combine($normalizedInstallDir, 'QuizMate.exe'),
  [IO.Path]::Combine($normalizedInstallDir, 'electron.exe')
)

$running = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and ($targetPaths -contains $_.ExecutablePath)
}

$running | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 800

$remaining = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and ($targetPaths -contains $_.ExecutablePath)
}

if ($remaining) {
  exit 10
}

exit 0
