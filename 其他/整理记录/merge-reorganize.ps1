$ErrorActionPreference = 'Stop'

$examRoot = [System.IO.Path]::GetFullPath('E:\ai项目\考试插件')
$autumnRoot = [System.IO.Path]::GetFullPath('E:\ai项目\秋招助手')
$archiveRoot = Join-Path $examRoot '归档l历史代码正常不需要引用\20260812-秋招助手与考试插件合并'
$records = [System.Collections.Generic.List[object]]::new()

function Assert-InRoot([string]$Path, [string[]]$AllowedRoots) {
  $full = [System.IO.Path]::GetFullPath($Path)
  foreach ($root in $AllowedRoots) {
    $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\')
    if ($full.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { return $full }
    $prefix = $rootFull + '\'
    if ($full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { return $full }
  }
  throw "Path is outside allowed roots: $full"
}

function Ensure-Directory([string]$Path) {
  $full = Assert-InRoot $Path @($examRoot, $autumnRoot)
  if (-not (Test-Path -LiteralPath $full)) {
    New-Item -ItemType Directory -Path $full | Out-Null
  }
  return $full
}

function Move-Safely([string]$Source, [string]$Destination, [string]$Category) {
  if (-not (Test-Path -LiteralPath $Source)) {
    $records.Add([pscustomobject]@{ Status='SKIPPED_MISSING'; Category=$Category; Source=$Source; Destination=$Destination; Time=(Get-Date).ToString('s') })
    return
  }
  $sourceFull = Assert-InRoot $Source @($examRoot, $autumnRoot)
  $destinationFull = Assert-InRoot $Destination @($examRoot)
  if (Test-Path -LiteralPath $destinationFull) {
    throw "Destination already exists: $destinationFull"
  }
  $parent = Split-Path -Parent $destinationFull
  Ensure-Directory $parent | Out-Null
  Move-Item -LiteralPath $sourceFull -Destination $destinationFull
  if ((Test-Path -LiteralPath $sourceFull) -or -not (Test-Path -LiteralPath $destinationFull)) {
    throw "Move verification failed: $sourceFull -> $destinationFull"
  }
  $records.Add([pscustomobject]@{ Status='MOVED'; Category=$Category; Source=$sourceFull; Destination=$destinationFull; Time=(Get-Date).ToString('s') })
}

function Copy-Safely([string]$Source, [string]$Destination, [string]$Category) {
  if (-not (Test-Path -LiteralPath $Source)) {
    $records.Add([pscustomobject]@{ Status='SKIPPED_MISSING'; Category=$Category; Source=$Source; Destination=$Destination; Time=(Get-Date).ToString('s') })
    return
  }
  $sourceFull = Assert-InRoot $Source @($autumnRoot)
  $destinationFull = Assert-InRoot $Destination @($examRoot)
  if (Test-Path -LiteralPath $destinationFull) {
    $records.Add([pscustomobject]@{ Status='REUSED_EXISTING_COPY'; Category=$Category; Source=$sourceFull; Destination=$destinationFull; Time=(Get-Date).ToString('s') })
    return
  }
  Ensure-Directory (Split-Path -Parent $destinationFull) | Out-Null
  $sourceItem = Get-Item -LiteralPath $sourceFull -Force
  if ($sourceItem.PSIsContainer) {
    & robocopy.exe $sourceFull $destinationFull /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Robocopy failed with exit code $LASTEXITCODE`: $sourceFull -> $destinationFull" }
    $sourceFiles = @(Get-ChildItem -LiteralPath $sourceFull -Recurse -File -Force -ErrorAction SilentlyContinue)
    $destinationFiles = @(Get-ChildItem -LiteralPath $destinationFull -Recurse -File -Force -ErrorAction SilentlyContinue)
    $sourceBytes = [long](($sourceFiles | Measure-Object Length -Sum).Sum)
    $destinationBytes = [long](($destinationFiles | Measure-Object Length -Sum).Sum)
    if ($sourceFiles.Count -ne $destinationFiles.Count -or $sourceBytes -ne $destinationBytes) {
      throw "Copy verification failed: $sourceFull -> $destinationFull"
    }
  } else {
    Copy-Item -LiteralPath $sourceFull -Destination $destinationFull -Force
    if ((Get-Item -LiteralPath $sourceFull).Length -ne (Get-Item -LiteralPath $destinationFull).Length) {
      throw "Copy verification failed: $sourceFull -> $destinationFull"
    }
  }
  $records.Add([pscustomobject]@{ Status='COPIED_WORKSPACE_LOCKED'; Category=$Category; Source=$sourceFull; Destination=$destinationFull; Time=(Get-Date).ToString('s') })
}

Ensure-Directory $archiveRoot | Out-Null
Ensure-Directory (Join-Path $examRoot '其他') | Out-Null
Ensure-Directory (Join-Path $examRoot '其他\整理记录') | Out-Null

# 秋招助手：最新版扩展进入正式产品域，其余验证构建全部归档。
Copy-Safely (Join-Path $autumnRoot 'extension') (Join-Path $examRoot '扩展插件版\QuizMate-网申助手') '秋招助手最新版'
Ensure-Directory (Join-Path $examRoot '运营管理\deliverables\2026-08-12-CSDN') | Out-Null
Copy-Safely (Join-Path $autumnRoot 'qzmate-csdn-article-04.md') (Join-Path $examRoot '运营管理\deliverables\2026-08-12-CSDN\qzmate-csdn-article-04.md') '秋招助手当前运营资料'
foreach ($name in @('tmp','release')) {
  Copy-Safely (Join-Path $autumnRoot $name) (Join-Path $archiveRoot "秋招助手历史\$name") '秋招助手历史验证文件'
}
$records.Add([pscustomobject]@{ Status='SKIPPED_EMPTY_LOCKED'; Category='秋招助手空占位目录'; Source=(Join-Path $autumnRoot 'client'); Destination=''; Time=(Get-Date).ToString('s') })
$records.Add([pscustomobject]@{ Status='SKIPPED_EMPTY_LOCKED'; Category='秋招助手空占位目录'; Source=(Join-Path $autumnRoot 'mac-build'); Destination=''; Time=(Get-Date).ToString('s') })

# 官网：职位雷达 Web 按 B2 归档；历史下载包与 Mac 文件脱离正式官网。
Move-Safely (Join-Path $examRoot '官网模块\辅助页面-watch-web') (Join-Path $archiveRoot '官网历史\职位雷达Web-watch.quizmate.vip') 'B2职位雷达归档'
$downloads = Join-Path $examRoot '官网模块\正式官网-quizmate.vip\downloads'
$downloadArchive = Join-Path $archiveRoot '官网历史\历史下载包'
if (Test-Path -LiteralPath $downloads) {
  $downloadFiles = Get-ChildItem -LiteralPath $downloads -File
  foreach ($file in $downloadFiles) {
    $archive = $false
    if ($file.Name -like 'QuizMate-Windows-*.exe' -and $file.Name -ne 'QuizMate-Windows-2026.8.10.exe') { $archive = $true }
    if ($file.Name -like 'QuizMate-Android-*.apk' -and $file.Name -ne 'QuizMate-Android-2026.07.31.apk') { $archive = $true }
    if ($file.Name -like 'QuizMate-Mac-*') { $archive = $true }
    if ($file.Name -eq 'QuizMate-Career-Extension-2.0.0.zip') { $archive = $true }
    if ($file.Name -eq '网页学习助手-电脑版.zip') { $archive = $true }
    if ($archive) {
      Move-Safely $file.FullName (Join-Path $downloadArchive $file.Name) '官网历史下载'
    }
  }
}

# 后端：生产主后端与统一入口保留，CloudBase 回退代码归档。
Move-Safely (Join-Path $examRoot '注册登陆模块（包含充值）\CloudBase兼容云函数') (Join-Path $archiveRoot '后端历史\CloudBase兼容云函数') 'CloudBase历史回退'

# Windows：先保存唯一最新安装包，再归档旧分支、插件与全部可再生成构建目录。
$oldWindowsRoot = Join-Path $examRoot 'window客户端'
Move-Safely (Join-Path $oldWindowsRoot '发布包') (Join-Path $archiveRoot 'Windows历史\旧发布包目录') 'Windows旧发布包'
Ensure-Directory (Join-Path $oldWindowsRoot '发布包') | Out-Null
$latestInstaller = Join-Path $examRoot 'output\releases\QuizMate-Windows-2026.8.10.exe'
Move-Safely $latestInstaller (Join-Path $oldWindowsRoot '发布包\QuizMate-Windows-2026.8.10.exe') 'Windows最新安装包'
Move-Safely (Join-Path $oldWindowsRoot 'QuizMate-Voice') (Join-Path $archiveRoot 'Windows历史\QuizMate-Voice') 'Windows历史分支'
Move-Safely (Join-Path $oldWindowsRoot '浏览器插件') (Join-Path $archiveRoot '扩展插件历史\window客户端-浏览器插件-2.0.0') '扩展插件旧版'

$windowsProject = Join-Path $oldWindowsRoot 'QuizMate-Windows'
if (Test-Path -LiteralPath $windowsProject) {
  Get-ChildItem -LiteralPath $windowsProject -Directory -Force |
    Where-Object { $_.Name -eq 'node_modules' -or $_.Name -eq 'out' -or $_.Name -like 'release*' } |
    ForEach-Object {
      Move-Safely $_.FullName (Join-Path $archiveRoot "Windows历史\可再生成构建\$($_.Name)") 'Windows构建缓存'
    }
  foreach ($cacheName in @('tsconfig.node.tsbuildinfo','tsconfig.web.tsbuildinfo')) {
    Move-Safely (Join-Path $windowsProject $cacheName) (Join-Path $archiveRoot "Windows历史\可再生成构建\$cacheName") 'Windows构建缓存'
  }
}

# 根输出和 Mac 调试残留。
Move-Safely (Join-Path $examRoot 'output') (Join-Path $archiveRoot '构建与发布历史\output') '历史输出目录'
Move-Safely (Join-Path $examRoot 'tmp') (Join-Path $archiveRoot '构建与发布历史\tmp') '临时部署包'
Move-Safely (Join-Path $examRoot 'dmg_extracted') (Join-Path $archiveRoot 'Mac历史\dmg_extracted') 'Mac历史'
Move-Safely (Join-Path $examRoot 'QuizMate-Mac-打包.zip') (Join-Path $archiveRoot 'Mac历史\QuizMate-Mac-打包.zip') 'Mac历史'
Move-Safely (Join-Path $examRoot 'old-quizmate-setup.exe') (Join-Path $archiveRoot 'Windows历史\old-quizmate-setup.exe') 'Windows旧安装包'

# 运营管理：按 C2 只归档明确早于 2026-07-25 的批次与并发冲突副本。
$deliverables = Join-Path $examRoot '运营管理\deliverables'
foreach ($name in @('2026-07-12-小红书百度推广','2026-07-13-秋招推广','2026-07-13-60篇软文矩阵','2026-07-13-平台推荐','_并发文件冲突待核对')) {
  Move-Safely (Join-Path $deliverables $name) (Join-Path $archiveRoot "运营历史-20260725以前\deliverables\$name") 'C2旧运营批次'
}
foreach ($name in @('Day1-激进执行手册-2026-07-11.md','官网SEO检查报告-2026-07-12.md','运营执行清单-2026-07-12.md')) {
  Move-Safely (Join-Path $deliverables $name) (Join-Path $archiveRoot "运营历史-20260725以前\deliverables\$name") 'C2旧运营文件'
}
Move-Safely (Join-Path $examRoot '运营管理\QuizMate管理后台') (Join-Path $archiveRoot '运营历史-20260725以前\旧管理后台') '旧管理后台副本'

# 测试文档：按 D2 归档历史证据，只保留当前产品测试资料和总测试文档。
Move-Safely (Join-Path $examRoot '测试文档\自动化测试证据') (Join-Path $archiveRoot '测试历史\自动化测试证据') 'D2历史测试证据'
Move-Safely (Join-Path $examRoot '测试文档\test-evidence') (Join-Path $archiveRoot '测试历史\test-evidence') 'D2历史测试证据'
Move-Safely (Join-Path $examRoot '测试文档\阿里云后端白盒链路审计-20260720.md') (Join-Path $archiveRoot '测试历史\阿里云后端白盒链路审计-20260720.md') 'D2历史测试文档'

# 根目录调试日志、一次性检查结果和本机生成物归档。
$rootArchiveNames = @(
  'backup_result.json','check-ecs-log.txt','check_cmd.sh','check_cmd2.sh','check_invoke.json','check_invoke2.json',
  'check_log.sh','check_log_decoded.txt','check_log_invoke.json','check_log_result.json','check_model.sh','check_model2.sh',
  'check_model2_decoded.txt','check_model2_invoke.json','check_model2_result.json','check_model_decoded.txt','check_model_invoke.json',
  'check_model_result.json','check_result.json','check_result2.json','check_timing.sh','check_timing2.sh','check_timing2_result.json',
  'check_timing_invoke.json','check_timing_result.json','decoded.txt','dmg_analyzer.js','dmg_arm64_final.txt','dmg_arm64_log.txt',
  'dmg_extractor.js','dmg_final_analyzer.js','dmg_x64_final.txt','dmg_x64_log.txt','gateway_upload.json','gitignore_main.txt',
  'gitignore_main_full.txt','gitignore_main_raw.txt','invoke_id.txt','invoke_result.json','invoke_result2.txt','mish_debug.js',
  'query_result.json','quizmate.vip','result.txt','result2.txt','result3.txt','run_cmd.json','timing2_decoded.txt','verify-niman-log.txt',
  'deploy-tts-log.txt','deploy-tts-v2-log.txt','deploy-tts-v3-log.txt','gradle-build.log','gradle-build2.log',
  'gradle-build-20260731.log','gradle-build-fix.log','ossutil.log','upload-win-log.txt','upload-direct.log','upload-stdout.txt',
  'upload-stderr.txt','upload-progress.txt','upload-v3.log','build-v3.log','build-final-v3.log','upload-log-v2.log',
  'build-output-v2.log','build-output-final.log','build-output.log','微信图片_20260724095055_146_1.png'
)
foreach ($name in $rootArchiveNames) {
  Move-Safely (Join-Path $examRoot $name) (Join-Path $archiveRoot "根目录历史与日志\$name") '根目录历史与日志'
}
$oddFile = Get-ChildItem -LiteralPath $examRoot -File -Force | Where-Object { $_.Name -like 'ourcesappoutvsworkbench*' } | Select-Object -First 1
if ($oddFile) {
  Move-Safely $oddFile.FullName (Join-Path $archiveRoot "根目录历史与日志\$($oddFile.Name)") '异常残留文件'
}

# 通用资料进入“其他”，根 scripts 先整体迁入，后续再筛除旧的一次性脚本并修正相对路径。
foreach ($name in @('config','specs','skills')) {
  Move-Safely (Join-Path $examRoot $name) (Join-Path $examRoot "其他\$name") '其他开发资料'
}
foreach ($name in @('文件夹整理说明-20260719.md','目录迁移清单-20260719.md','版本管理实操手册.md')) {
  Move-Safely (Join-Path $examRoot $name) (Join-Path $examRoot "其他\历史说明\$name") '其他历史说明'
}
Move-Safely (Join-Path $examRoot 'scripts') (Join-Path $examRoot '其他\部署工具') '其他部署工具'
Move-Safely (Join-Path $examRoot 'node_modules') (Join-Path $archiveRoot '可再生成依赖\根node_modules') '可再生成依赖'

# 正式产品域重命名。
Move-Safely (Join-Path $examRoot '注册登陆模块（包含充值）') (Join-Path $examRoot '注册登陆模块') '正式目录重命名'
Move-Safely (Join-Path $examRoot 'window客户端') (Join-Path $examRoot 'windows客户端') '正式目录重命名'
Move-Safely (Join-Path $examRoot '邀请和代理机制') (Join-Path $examRoot '邀请注册机制') '正式目录重命名'
Ensure-Directory (Join-Path $examRoot 'mac客户端') | Out-Null

$logPath = Join-Path $autumnRoot '迁移操作-20260812.csv'
$records | Export-Csv -LiteralPath $logPath -NoTypeInformation -Encoding utf8
Write-Output "MERGE_MOVE_PHASE_OK operations=$($records.Count) log=$logPath"
