$ErrorActionPreference = 'Stop'

$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$workspacePrefix = $workspaceRoot + [IO.Path]::DirectorySeparatorChar

$relativeTargets = @(
  'windows客户端\QuizMate-Windows\release',
  'windows客户端\QuizMate-Windows\out',
  'mac客户端\QuizMate-Mac\out',
  '测试文档\test-evidence\CHG-20260904-01\mac-artifacts\QuizMate-Mac-Intel-66\release',
  '测试文档\test-evidence\CHG-20260904-01\mac-artifacts\QuizMate-Mac-Apple-Silicon-66\release',
  'tmp\quizmate-api-CHG-20260905-01-feedback.tar.gz',
  '_build\releases\2026.08.29\windows\QuizMate-Windows-2026.08.29.exe'
)

$resolvedTargets = [Collections.Generic.List[string]]::new()
foreach ($relativeTarget in $relativeTargets) {
  $absoluteTarget = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $relativeTarget))
  if (-not $absoluteTarget.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Cleanup target escaped the workspace: $absoluteTarget"
  }
  if (Test-Path -LiteralPath $absoluteTarget) {
    Write-Output "VERIFIED_DELETE_TARGET $absoluteTarget"
    $resolvedTargets.Add($absoluteTarget)
  } else {
    Write-Output "ALREADY_ABSENT $absoluteTarget"
  }
}

foreach ($absoluteTarget in $resolvedTargets) {
  $item = Get-Item -LiteralPath $absoluteTarget
  if ($item.PSIsContainer) {
    Remove-Item -LiteralPath $absoluteTarget -Recurse -Force
  } else {
    Remove-Item -LiteralPath $absoluteTarget -Force
  }
  Write-Output "REMOVED $absoluteTarget"
}

foreach ($relativeTarget in $relativeTargets) {
  $absoluteTarget = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $relativeTarget))
  if (Test-Path -LiteralPath $absoluteTarget) {
    throw "Cleanup target still exists: $absoluteTarget"
  }
  Write-Output "ABSENT_AFTER $absoluteTarget"
}

$preservedFiles = @(
  '_build\releases\2026.09.05\windows\QuizMate-Windows-2026.09.05.exe',
  '_build\releases\2026.08.29\verify\QuizMate-Windows-2026.08.29.exe',
  '测试文档\test-evidence\CHG-20260904-01\mac-artifacts\QuizMate-Mac-Intel-66\launch-smoke.log',
  '测试文档\test-evidence\CHG-20260904-01\mac-artifacts\QuizMate-Mac-Apple-Silicon-66\launch-smoke.log'
)

foreach ($relativeFile in $preservedFiles) {
  $absoluteFile = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $relativeFile))
  if (-not (Test-Path -LiteralPath $absoluteFile -PathType Leaf)) {
    throw "Required preserved file is missing: $absoluteFile"
  }
  Write-Output "PRESERVED $absoluteFile"
}
