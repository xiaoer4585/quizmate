<#
.SYNOPSIS
  QuizMate 每日博客自动发布脚本
.DESCRIPTION
  从 blog-queue.txt 队列中取出一篇 Markdown 文章，
  转换为 SEO/GEO 优化的 HTML 博客页面，
  更新博客索引页和 sitemap，提交到百度。
  每天由 Windows 任务计划程序调用一次。
#>

param(
  [string]$SiteRoot = "E:\ai项目\考试插件\官网模块\正式官网-quizmate.vip",
  [string]$BaiduToken = "2qRep6YZQ2RsdR3S"
)

$ErrorActionPreference = "Stop"
$queueFile = Join-Path $SiteRoot "blog-queue.txt"
$logFile   = Join-Path $SiteRoot "blog-publish-log.txt"
$blogDir   = Join-Path $SiteRoot "blog"

function Write-Log([string]$msg) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$ts] $msg"
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

# --- 1. 读取队列 ---
if (-not (Test-Path $queueFile)) { Write-Log "队列文件不存在，退出"; exit 0 }
$lines = @(Get-Content $queueFile -Encoding UTF8 | Where-Object { $_.Trim() -ne "" })
if ($lines.Count -eq 0) { Write-Log "队列为空，所有文章已发布完毕"; exit 0 }

$sourcePath = [string]$lines[0]
$sourcePath = $sourcePath.Trim()
if ($lines.Count -gt 1) {
  $remaining = $lines[1..($lines.Count - 1)]
} else {
  $remaining = @()
}

if (-not (Test-Path $sourcePath)) {
  Write-Log "源文件不存在: $sourcePath，跳过"
  Set-Content -Path $queueFile -Value $remaining -Encoding UTF8
  exit 0
}

Write-Log "开始处理: $sourcePath"

# --- 2. 读取 Markdown ---
$md = Get-Content $sourcePath -Encoding UTF8 -Raw

# --- 3. 提取标题 ---
$titleMatch = [regex]::Match($md, '(?m)^#\s+(.+)$')
if (-not $titleMatch.Success) {
  $rawTitle = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
} else {
  $rawTitle = $titleMatch.Groups[1].Value.Trim()
}
# 清理标题前缀
$cleanTitle = $rawTitle -replace '^【[^】]+】\s*', '' -replace '^知乎问答\s*Q\d+[：:]\s*', '' -replace '^\d+_', ''
if ($cleanTitle.Length -gt 60) { $cleanTitle = $cleanTitle.Substring(0, 60) }
$pageTitle = "$cleanTitle - QuizMate 笔试面试AI助手"

# --- 4. 生成 URL slug ---
$fileName = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
$slug = $fileName -replace '[^\w\u4e00-\u9fff\-]', '-' -replace '-{2,}', '-' -replace '^-|-$', ''
$slug = $slug.ToLower()
$htmlFileName = "article-$slug.html"
$htmlPath = Join-Path $blogDir $htmlFileName
$publicUrl = "https://www.quizmate.vip/blog/$htmlFileName"

# 如果目标文件已存在，加序号
$counter = 2
while (Test-Path $htmlPath) {
  $htmlFileName = "article-$slug-$counter.html"
  $htmlPath = Join-Path $blogDir $htmlFileName
  $publicUrl = "https://www.quizmate.vip/blog/$htmlFileName"
  $counter++
}

# --- 5. 提取关键词 ---
$keywords = "QuizMate,笔试面试AI助手,求职AI搭子,笔试助手,面试助手"
if ($md -match '秋招')   { $keywords += ",秋招笔试,秋招面试,2026秋招" }
if ($md -match '行测')   { $keywords += ",行测题,行测技巧" }
if ($md -match '笔试')   { $keywords += ",笔试技巧,笔试题型" }
if ($md -match '面试')   { $keywords += ",面试技巧,面试准备" }
if ($md -match '网申')   { $keywords += ",网申填写" }
if ($md -match '简历')   { $keywords += ",简历制作" }
if ($md -match '刷题')   { $keywords += ",刷题方法,在线题库" }
if ($md -match 'AI')     { $keywords += ",AI笔试助手,AI答题" }
if ($md -match '求职')   { $keywords += ",求职工具,求职攻略" }
if ($md -match '考研')   { $keywords += ",考研复习" }
if ($md -match '公务员|公考') { $keywords += ",公务员考试,公考行测" }
if ($md -match '教资|教师资格') { $keywords += ",教师资格证,教资笔试" }
if ($md -match 'Python')  { $keywords += ",Python刷题" }
if ($md -match '知识库')  { $keywords += ",个人知识库" }

# --- 6. 提取摘要 ---
$desc = $cleanTitle + "。QuizMate笔试面试AI助手，你的求职AI搭子，不截屏不切屏录屏无痕，覆盖笔试、面试、网申、简历全流程。"
if ($desc.Length -gt 160) { $desc = $desc.Substring(0, 160) }

# --- 7. Markdown 转 HTML ---
function Convert-MdToHtml([string]$text) {
  $html = $text

  # 转义 HTML 特殊字符（但保留 ** 和 # 等标记先处理）
  # 移除第一个 # 标题行
  $html = [regex]::Replace($html, '(?m)^#\s+.+\r?\n', '')

  # h3
  $html = [regex]::Replace($html, '(?m)^###\s+(.+)$', '<h3>$1</h3>')
  # h2
  $html = [regex]::Replace($html, '(?m)^##\s+(.+)$', '<h2>$1</h2>')

  # 水平线
  $html = [regex]::Replace($html, '(?m)^---+$', '<hr>')

  # 引用块
  $html = [regex]::Replace($html, '(?m)^>\s*(.+)$', '<blockquote>$1</blockquote>')

  # 加粗
  $html = [regex]::Replace($html, '\*\*(.+?)\*\*', '<strong>$1</strong>')

  # 链接
  $html = [regex]::Replace($html, '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>')

  # 无序列表（连续的 - 开头行合并为 ul）
  $html = [regex]::Replace($html, '(?m)(^- .+(?:\r?\n- .+)*)', {
    param($m)
    $items = $m.Value -split "`n" | ForEach-Object { $_ -replace '^- ', '<li>' }
    $items = $items -replace '$', '</li>'
    return "<ul>`n" + ($items -join "`n") + "`n</ul>"
  })

  # 有序列表（连续的 1. 2. 等开头行）
  $html = [regex]::Replace($html, '(?m)(^\d+\.\s+.+(?:\r?\n\d+\.\s+.+)*)', {
    param($m)
    $items = $m.Value -split "`n" | ForEach-Object { $_ -replace '^\d+\.\s+', '<li>' }
    $items = $items -replace '$', '</li>'
    return "<ol>`n" + ($items -join "`n") + "`n</ol>"
  })

  # 段落：将连续非标签行包裹 <p>
  $lines = $html -split "`n"
  $result = @()
  $inPara = $false
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "") {
      if ($inPara) { $result += "</p>"; $inPara = $false }
    } elseif ($trimmed -match '^<(h\d|ul|ol|blockquote|hr|div|p)') {
      if ($inPara) { $result += "</p>"; $inPara = $false }
      $result += $line
    } else {
      if (-not $inPara) { $result += "<p>"; $inPara = $true }
      $result += $line
    }
  }
  if ($inPara) { $result += "</p>" }
  $html = $result -join "`n"

  # 清理多余空行
  $html = [regex]::Replace($html, '\n{3,}', "`n`n")

  return $html
}

$bodyHtml = Convert-MdToHtml $md

# --- 8. 生成日期 ---
$pubDate = Get-Date -Format "yyyy-MM-dd"
$datePublished = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00"

# --- 9. 组装完整 HTML ---
$htmlTemplate = @"
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="$desc" />
    <meta name="theme-color" content="#ffffff" />
    <meta name="keywords" content="$keywords" />
    <link rel="canonical" href="$publicUrl" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="$publicUrl" />
    <meta property="og:title" content="$cleanTitle" />
    <meta property="og:description" content="$desc" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="QuizMate" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="$cleanTitle" />
    <meta name="twitter:description" content="$desc" />
    <title>$pageTitle</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="../styles.css?v=20260808-blog" />
    <script defer src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
    <script defer src="../app.js?v=20260727-mobile2"></script>
    <script defer src="../credits.js?v=20260801-pkgs"></script>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "$cleanTitle",
        "description": "$desc",
        "datePublished": "$datePublished",
        "dateModified": "$datePublished",
        "author": { "@type": "Organization", "name": "QuizMate" },
        "publisher": {
          "@type": "Organization",
          "name": "QuizMate",
          "url": "https://www.quizmate.vip/"
        },
        "mainEntityOfPage": "$publicUrl",
        "keywords": "$keywords"
      }
    </script>
    <style>
      .blog-page { background:#fff; }
      .blog-container { max-width:860px; margin:0 auto; padding:48px 32px 80px; font-size:15px; line-height:1.8; color:#1f2329; }
      .blog-container h1 { font-size:28px; font-weight:700; margin:0 0 8px; }
      .blog-meta { font-size:13px; color:#8f959e; margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid #e5e6eb; }
      .blog-container h2 { font-size:22px; font-weight:700; margin:40px 0 16px; }
      .blog-container h3 { font-size:18px; font-weight:600; margin:32px 0 12px; }
      .blog-container p { margin:0 0 14px; }
      .blog-container ul, .blog-container ol { padding-left:24px; margin:0 0 14px; }
      .blog-container li { margin-bottom:6px; }
      .blog-container blockquote { border-left:3px solid #3370ff; padding:8px 16px; margin:16px 0; background:#f7f8fa; color:#646a73; }
      .blog-container a { color:#3370ff; }
      .blog-container hr { border:none; border-top:1px solid #e5e6eb; margin:32px 0; }
      .blog-container table { width:100%; border-collapse:collapse; margin:16px 0; font-size:14px; }
      .blog-container th, .blog-container td { border:1px solid #e5e6eb; padding:10px 14px; text-align:left; }
      .blog-container th { background:#f7f8fa; font-weight:600; }
      .blog-cta { margin-top:48px; padding:24px; background:#f0f5ff; border-radius:12px; text-align:center; }
      .blog-cta h3 { margin:0 0 8px; font-size:18px; }
      .blog-cta p { margin:0 0 16px; color:#646a73; font-size:14px; }
      .blog-btn { display:inline-block; padding:10px 28px; background:#3370ff; color:#fff!important; border-radius:8px; text-decoration:none; font-weight:600; margin:0 8px; }
      .blog-btn:hover { background:#2456d6; }
      @media (max-width:768px) { .blog-container { padding:32px 20px 60px; } }
    </style>
  </head>
  <body data-page="blog">
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="site-header" data-header>
      <div class="header-inner">
        <a class="brand" href="/"><span class="brand-mark">Q</span><span>QuizMate</span></a>
        <nav class="desktop-nav" aria-label="主导航">
          <a href="../">首页</a>
          <a href="../docs.html">操作文档</a>
          <a href="../recharge.html">充值</a>
          <a href="../download.html">下载</a>
          <a href="../blog.html">博客</a>
        </nav>
        <button class="account-nav-button" type="button" data-open-auth>
          <i data-lucide="user-round" aria-hidden="true"></i>
          <span data-header-account>登录</span>
        </button>
        <button class="menu-button" type="button" aria-label="打开导航菜单" aria-expanded="false" data-menu-button>
          <i data-lucide="menu"></i>
        </button>
      </div>
      <nav class="mobile-nav" aria-label="移动端导航" data-mobile-nav>
        <a href="../">首页</a>
        <a href="../docs.html">操作文档</a>
        <a href="../recharge.html">充值</a>
        <a href="../download.html">下载</a>
        <a href="../blog.html">博客</a>
      </nav>
    </header>

    <main id="main" class="blog-page">
      <div class="blog-container">
        <article>
          <h1>$cleanTitle</h1>
          <p class="blog-meta">QuizMate 笔试面试AI助手 · $pubDate</p>
$bodyHtml
        </article>

        <div class="blog-cta">
          <h3>用 QuizMate 提升你的求职效率</h3>
          <p>笔试面试AI助手，你的求职AI搭子。不截屏、不切屏、录屏无痕。</p>
          <a class="blog-btn" href="https://www.quizmate.vip/">访问官网</a>
          <a class="blog-btn" href="../download.html" style="background:#1f2329;">立即下载</a>
        </div>
      </div>
    </main>

    <footer class="footer-v3 footer-minimal">
      <p class="copyright">© 2026 答题悬浮助手 · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">赣ICP备2025058268号-2</a></p>
    </footer>
  </body>
</html>
"@

# --- 10. 写入 HTML 文件 ---
[System.IO.File]::WriteAllText($htmlPath, $htmlTemplate, [System.Text.Encoding]::UTF8)
Write-Log "已生成: $htmlPath"

# --- 11. 更新 blog.html 索引页 ---
$blogIndexPath = Join-Path $SiteRoot "blog.html"
$indexHtml = Get-Content $blogIndexPath -Encoding UTF8 -Raw

# 提取标签
$tag = "求职攻略"
if ($md -match '行测|数量关系|言语理解|资料分析|判断推理') { $tag = "行测技巧" }
elseif ($md -match '笔试') { $tag = "笔试技巧" }
elseif ($md -match '面试') { $tag = "面试准备" }
elseif ($md -match '秋招|春招|校招') { $tag = "秋招攻略" }
elseif ($md -match 'AI|工具|神器') { $tag = "工具测评" }
elseif ($md -match '网申|简历') { $tag = "求职工具" }
elseif ($md -match '考研') { $tag = "考研备考" }
elseif ($md -match '公务员|公考') { $tag = "公考备考" }

# 生成摘要（取第一段非标题文字）
$summary = ""
$mdLines = $md -split "`n" | Where-Object { $_.Trim() -ne "" -and $_ -notmatch '^#' -and $_ -notmatch '^>' -and $_ -notmatch '^---' }
if ($mdLines.Count -gt 0) {
  $firstPara = $mdLines[0] -replace '\*\*', '' -replace '\[([^\]]+)\]\(([^)]+)\)', '$1'
  $summary = $firstPara.Trim()
  if ($summary.Length -gt 120) { $summary = $summary.Substring(0, 120) + "..." }
}

$readTime = "约5分钟"
$wordCount = ($md -replace '\s', '').Length
if ($wordCount -gt 1500) { $readTime = "约8分钟" }
elseif ($wordCount -gt 1000) { $readTime = "约6分钟" }

$newCard = @"
          <a class="blog-card" href="blog/$htmlFileName">
            <span class="blog-card-tag">$tag</span>
            <h2>$cleanTitle</h2>
            <p>$summary</p>
            <div class="blog-card-meta">
              <span><i data-lucide="calendar" style="width:14px;height:14px;"></i> $pubDate</span>
              <span><i data-lucide="clock" style="width:14px;height:14px;"></i> $readTime</span>
            </div>
          </a>
"@

# 在第一个 blog-card 前插入新卡片
if ($indexHtml -match '<div class="blog-list">') {
  $indexHtml = $indexHtml -replace '(<div class="blog-list">)', "`$1`n$newCard"
} else {
  # 如果没匹配到，追加到 blog-list 末尾
  $indexHtml = $indexHtml -replace '(</div>\s*</main>)', "$newCard`n`$1"
}

[System.IO.File]::WriteAllText($blogIndexPath, $indexHtml, [System.Text.Encoding]::UTF8)
Write-Log "已更新博客索引页"

# --- 12. 更新 sitemap.xml ---
$sitemapPath = Join-Path $SiteRoot "sitemap.xml"
$sitemap = Get-Content $sitemapPath -Encoding UTF8 -Raw
$newUrl = @"
  <url>
    <loc>$publicUrl</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
"@
$sitemap = $sitemap -replace '(</urlset>)', "$newUrl`n`$1"
[System.IO.File]::WriteAllText($sitemapPath, $sitemap, [System.Text.Encoding]::UTF8)
Write-Log "已更新 sitemap.xml"

# --- 13. 提交到百度 ---
try {
  $urls = "$publicUrl"
  $result = curl.exe -s -H "Content-Type:text/plain" --data-binary $urls "http://data.zz.baidu.com/urls?site=www.quizmate.vip&token=$BaiduToken" 2>&1
  Write-Log "百度提交结果: $result"
} catch {
  Write-Log "百度提交失败: $_"
}

# --- 14. 更新队列文件 ---
if ($remaining.Count -eq 0) {
  Set-Content -Path $queueFile -Value "" -Encoding UTF8
  Write-Log "队列已清空，所有文章发布完毕"
} else {
  Set-Content -Path $queueFile -Value $remaining -Encoding UTF8
  Write-Log "剩余 $($remaining.Count) 篇待发布"
}

Write-Log "发布完成: $cleanTitle -> $publicUrl"
