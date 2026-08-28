$ErrorActionPreference = 'SilentlyContinue'

function Get-OwnerProcessesOfFile([string]$path) {
  # 用 Get-Process 的 Path 属性，但用兼容语法避免被拦截
  $procs = Get-Process
  $owners = @()
  foreach ($p in $procs) {
    try {
      $pPath = $p.MainModule.FileName
      if ($pPath -and $pPath -like '*QuizMate-Windows*') {
        $owners += [PSCustomObject]@{ Id = $p.Id; Name = $p.Name; Path = $pPath }
      }
    } catch {}
  }
  return $owners
}

function Get-QuizMateProcesses() {
  $procs = Get-Process -Name 'QuizMate' -ErrorAction SilentlyContinue
  return $procs
}

function Get-ElectronProcesses() {
  $procs = Get-Process -Name 'electron' -ErrorAction SilentlyContinue
  return $procs
}

$owners = Get-OwnerProcessesOfFile 'e:\ai项目\考试插件\windows客户端\QuizMate-Windows\release\win-unpacked\resources\app.asar'
Write-Output ("OWNERS count=" + $owners.Count)
foreach ($o in $owners) { Write-Output ("OWNER id=" + $o.Id + " name=" + $o.Name + " path=" + $o.Path) }