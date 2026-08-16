$block = @'
    <!-- 悬浮客服二维码 -->
    <div class="float-contact" id="floatContact">
      <button class="float-contact-toggle" id="floatContactToggle" type="button" aria-label="联系客服" aria-expanded="false">
        <svg class="float-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span class="float-contact-badge">客服</span>
      </button>
      <div class="float-contact-panel" id="floatContactPanel">
        <button class="float-contact-close" id="floatContactClose" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <p class="float-contact-title">扫码联系客服</p>
        <div class="float-contact-codes">
          <div class="float-contact-code">
            <img src="../assets/qr-wechat.jpg" alt="微信客服二维码" />
            <span>微信</span>
          </div>
          <div class="float-contact-code">
            <img src="../assets/qr-qq.jpg" alt="QQ客服二维码" />
            <span>QQ</span>
          </div>
        </div>
      </div>
    </div>
    <script>
    (function () {
      function init() {
        var toggle = document.getElementById("floatContactToggle");
        var closeBtn = document.getElementById("floatContactClose");
        var fc = document.getElementById("floatContact");
        var panel = document.getElementById("floatContactPanel");
        if (!toggle || !fc) return;
        function open() { fc.classList.add("is-open"); toggle.setAttribute("aria-expanded", "true"); }
        function close() { fc.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); }
        toggle.addEventListener("click", function (e) { e.stopPropagation(); fc.classList.contains("is-open") ? close() : open(); });
        if (closeBtn) closeBtn.addEventListener("click", function (e) { e.stopPropagation(); close(); });
        document.addEventListener("click", function () { close(); });
        if (panel) panel.addEventListener("click", function (e) { e.stopPropagation(); });
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    })();
    </script>
'@

$blogDir = "e:\ai项目\考试插件\官网模块\正式官网-quizmate.vip\blog"
$files = Get-ChildItem -Path $blogDir -Filter "*.html"
$updated = 0
$skipped = 0

foreach ($file in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)

    if ($content.Contains("floatContact")) {
        $skipped++
        continue
    }

    $marker = "</body>"
    $idx = $content.IndexOf($marker)
    if ($idx -ge 0) {
        $newContent = $content.Substring(0, $idx) + $block + "`r`n  " + $content.Substring($idx)
        $utf8 = New-Object System.Text.UTF8Encoding($hasBom)
        [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8)
        $updated++
        Write-Output "Updated: $($file.Name)"
    } else {
        Write-Output "WARN no </body>: $($file.Name)"
    }
}

Write-Output "Total updated: $updated, skipped: $skipped"
