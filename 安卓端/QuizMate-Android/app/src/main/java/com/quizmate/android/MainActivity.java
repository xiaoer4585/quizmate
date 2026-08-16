package com.quizmate.android;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextPaint;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * 登录页 + 管理页（账号信息、悬浮球开关、权限按钮）。
 *
 * 更新：
 *  - UI 居中显示，授权页面添加说明文字
 *  - 注册/忘记密码/充值在应用内 WebView 完成（自闭环）
 *  - 统一权限提示语言，屏幕录制权限按钮直接触发系统授权弹窗
 */
public class MainActivity extends Activity {
    private static final int REQUEST_SCREEN_CAPTURE = 1001;

    private AuthManager auth;
    private ScrollView scrollRoot;
    private LinearLayout contentLayout;
    private ProgressBar loading;
    private Switch overlaySwitchRef;
    private GestureConfig gestureConfig;

    // 标记刚从截图授权 Activity 返回，用于避免 onResume 误重置开关状态
    // （onActivityResult 在 onResume 之前调用，但 OverlayService 启动是异步的，
    //  此时 isRunning() 可能仍为 false，需要给服务时间初始化）
    private boolean justReturnedFromScreenCapture = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        auth = new AuthManager(this);
        gestureConfig = new GestureConfig(this);

        // 使用 ScrollView + 居中布局，避免内容聚在顶部
        scrollRoot = new ScrollView(this);
        scrollRoot.setBackgroundColor(0xFFF0F9FF);
        scrollRoot.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(48), dp(28), dp(36));
        scrollRoot.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        loading = new ProgressBar(this);
        loading.setVisibility(View.GONE);
        LinearLayout.LayoutParams loadingLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        loadingLp.gravity = Gravity.CENTER;
        loadingLp.bottomMargin = dp(12);
        root.addView(loading, loadingLp);

        contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(contentLayout, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(scrollRoot);

        refreshView();
    }

    private void refreshView() {
        contentLayout.removeAllViews();
        if (auth.isLoggedIn()) {
            showManagementPage();
        } else {
            showLoginPage();
        }
    }

    // ============================================================
    //  登录页（带注册/忘记密码/充值入口）
    // ============================================================

    private void showLoginPage() {
        // Logo / 标题
        TextView title = new TextView(this);
        title.setText("QuizMate");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(0xFF0EA5E9);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        contentLayout.addView(title, lpMatch());

        TextView subtitle = new TextView(this);
        subtitle.setText("登录账号以使用悬浮球功能");
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setTextColor(0xFF64748B);
        subtitle.setPadding(0, dp(6), 0, dp(32));
        contentLayout.addView(subtitle, lpMatch());

        // 邮箱输入框（带圆角背景）
        final EditText emailField = makeEditText("邮箱", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        contentLayout.addView(emailField, lpMatch());

        // 密码输入框
        final EditText passwordField = makeEditText("密码",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        LinearLayout.LayoutParams plp = lpMatch();
        plp.topMargin = dp(14);
        contentLayout.addView(passwordField, plp);

        // 登录按钮
        Button loginBtn = makeButton("登录", 0xFF0EA5E9, dp(12));
        LinearLayout.LayoutParams btnLp = lpMatch();
        btnLp.topMargin = dp(28);
        loginBtn.setLayoutParams(btnLp);
        loginBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String email = emailField.getText().toString().trim();
                String pwd = passwordField.getText().toString();
                if (email.isEmpty() || pwd.isEmpty()) {
                    toast("请输入邮箱和密码");
                    return;
                }
                setLoading(true);
                auth.loginAccount(email, pwd, new AuthManager.Callback() {
                    @Override
                    public void onSuccess(JSONObject data) {
                        setLoading(false);
                        toast("登录成功");
                        refreshView();
                    }
                    @Override
                    public void onError(String code, String msg) {
                        setLoading(false);
                        toast("登录失败: " + msg);
                    }
                });
            }
        });
        contentLayout.addView(loginBtn);

        // 忘记密码链接
        TextView forgotLink = makeLinkText("忘记密码？", new Runnable() {
            @Override
            public void run() {
                openWebView(AuthManager.RESET_PASSWORD_URL, "忘记密码");
            }
        });
        LinearLayout.LayoutParams fLp = lpMatch();
        fLp.topMargin = dp(16);
        fLp.gravity = Gravity.CENTER;
        forgotLink.setGravity(Gravity.CENTER);
        contentLayout.addView(forgotLink, fLp);

        // 注册 + 充值 链接行
        TextView regRecharge = makeDualLinkText("没有账号？去注册", new Runnable() {
            @Override
            public void run() {
                openWebView(AuthManager.REGISTER_URL, "注册账号");
            }
        }, "充值积分", new Runnable() {
            @Override
            public void run() {
                openWebView(AuthManager.RECHARGE_URL, "充值积分");
            }
        });
        LinearLayout.LayoutParams rrLp = lpMatch();
        rrLp.topMargin = dp(8);
        rrLp.gravity = Gravity.CENTER;
        contentLayout.addView(regRecharge, rrLp);

        // 底部说明
        TextView footer = new TextView(this);
        footer.setText("注册、忘记密码、充值均可直接在 App 内完成");
        footer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        footer.setTextColor(0xFF94A3B8);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams footLp = lpMatch();
        footLp.topMargin = dp(24);
        contentLayout.addView(footer, footLp);
    }

    // ============================================================
    //  管理页（带说明文字 + 充值入口）
    // ============================================================

    private void showManagementPage() {
        // 欢迎标题
        TextView welcome = new TextView(this);
        welcome.setText("已登录");
        welcome.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        welcome.setTextColor(0xFF64748B);
        welcome.setGravity(Gravity.CENTER);
        contentLayout.addView(welcome, lpMatch());

        TextView nameView = new TextView(this);
        nameView.setText(auth.getDisplayName());
        nameView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        nameView.setTextColor(0xFF0F172A);
        nameView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        nameView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nLp = lpMatch();
        nLp.topMargin = dp(4);
        contentLayout.addView(nameView, nLp);

        // 积分显示
        TextView creditsView = new TextView(this);
        creditsView.setText("积分余额：" + auth.getCredits());
        creditsView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        creditsView.setTextColor(0xFF0EA5E9);
        creditsView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams cLp = lpMatch();
        cLp.topMargin = dp(6);
        contentLayout.addView(creditsView, cLp);

        // 后台刷新资料
        auth.getAccountProfile(new AuthManager.Callback() {
            @Override
            public void onSuccess(JSONObject data) {
                nameView.setText(auth.getDisplayName());
                creditsView.setText("积分余额：" + auth.getCredits());
            }
            @Override
            public void onError(String code, String msg) { }
        });

        // 充值按钮
        Button rechargeBtn = makeButton("充值积分", 0xFFF59E0B, dp(10));
        LinearLayout.LayoutParams rcLp = lpMatch();
        rcLp.topMargin = dp(20);
        rechargeBtn.setLayoutParams(rcLp);
        rechargeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openWebView(AuthManager.RECHARGE_URL, "充值积分");
            }
        });
        contentLayout.addView(rechargeBtn);

        // 分区标题：功能控制
        TextView sectionFunc = makeSectionTitle("功能控制");
        LinearLayout.LayoutParams sfLp = lpMatch();
        sfLp.topMargin = dp(28);
        contentLayout.addView(sectionFunc, sfLp);

        // 悬浮球开关
        final Switch overlaySwitch = new Switch(this);
        overlaySwitch.setText("悬浮球开关");
        overlaySwitch.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        overlaySwitch.setChecked(OverlayService.isRunning());
        LinearLayout.LayoutParams swLp = lpMatch();
        swLp.topMargin = dp(8);
        overlaySwitch.setLayoutParams(swLp);
        overlaySwitch.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                if (isChecked) {
                    if (!Settings.canDrawOverlays(MainActivity.this)) {
                        toast("请先授予「悬浮窗权限」");
                        overlaySwitch.setChecked(false);
                        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                        return;
                    }
                    if (!ScreenCaptureService.isProjectionReady()) {
                        // 自动请求截图权限（开启悬浮球时一并授权，无需单独操作）
                        toast("请授权截图权限以识别屏幕");
                        requestScreenCapture();
                        return;
                    }
                    Intent svc = new Intent(MainActivity.this, OverlayService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(svc);
                    } else {
                        startService(svc);
                    }
                    toast("悬浮球已开启");
                } else {
                    // 只有服务确实在运行时才停止，避免程序化 setChecked(false) 误触发提示
                    if (OverlayService.isRunning()) {
                        Intent svc = new Intent(MainActivity.this, OverlayService.class);
                        stopService(svc);
                        toast("悬浮球已关闭");
                    }
                }
            }
        });
        contentLayout.addView(overlaySwitch);
        overlaySwitchRef = overlaySwitch;

        // ====================================================
        //  模式与手势配置
        // ====================================================
        addModeAndGestureSection();

        // 分区标题：权限设置
        TextView sectionPerm = makeSectionTitle("权限设置");
        LinearLayout.LayoutParams spLp = lpMatch();
        spLp.topMargin = dp(24);
        contentLayout.addView(sectionPerm, spLp);

        // 权限说明
        TextView permHint = new TextView(this);
        permHint.setText("使用悬浮球需要开启以下权限。点击对应按钮可跳转到系统设置进行授权。");
        permHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        permHint.setTextColor(0xFF64748B);
        permHint.setLineSpacing(0, 1.3f);
        LinearLayout.LayoutParams phLp = lpMatch();
        phLp.topMargin = dp(6);
        contentLayout.addView(permHint, phLp);

        // 1. 悬浮窗权限
        Button permOverlay = makeOutlineButton("① 悬浮窗权限（显示悬浮球）");
        permOverlay.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        });
        LinearLayout.LayoutParams poLp = lpMatch();
        poLp.topMargin = dp(12);
        permOverlay.setLayoutParams(poLp);
        contentLayout.addView(permOverlay);

        // 截图权限已合并到悬浮球开关中（开启悬浮球时自动请求授权）

        // 2. 无障碍服务权限
        Button permAccessibility = makeOutlineButton("② 无障碍服务（读取屏幕文字）");
        permAccessibility.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                startActivity(intent);
            }
        });
        LinearLayout.LayoutParams paLp = lpMatch();
        paLp.topMargin = dp(8);
        permAccessibility.setLayoutParams(paLp);
        contentLayout.addView(permAccessibility);

        // 使用说明
        TextView sectionUsage = makeSectionTitle("使用说明");
        LinearLayout.LayoutParams suLp = lpMatch();
        suLp.topMargin = dp(28);
        contentLayout.addView(sectionUsage, suLp);

        TextView usage = new TextView(this);
        usage.setText("1. 开启「悬浮窗权限」和「无障碍服务」\n"
                + "2. 在「模式选择」中选择悬浮框模式或语音播报模式\n"
                + "3. 打开「悬浮球开关」（首次会自动请求截图权限）\n"
                + "4. 单击悬浮球 = 截图识别；双击悬浮球 = 重听答案（无需配置）\n"
                + "5. 悬浮框模式：答案面板自动弹出；语音播报模式：答案自动语音播报\n"
                + "6. 拖动悬浮球可移动位置；截图为按需触发，不持续录屏\n"
                + "提示：语音播报模式需要手机安装中文 TTS 引擎（大多数手机自带）");
        usage.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        usage.setTextColor(0xFF475569);
        usage.setLineSpacing(0, 1.4f);
        LinearLayout.LayoutParams uLp = lpMatch();
        uLp.topMargin = dp(8);
        contentLayout.addView(usage, uLp);

        // 退出登录
        Button logoutBtn = makeButton("退出登录", 0xFFEF4444, dp(10));
        LinearLayout.LayoutParams loLp = lpMatch();
        loLp.topMargin = dp(36);
        logoutBtn.setLayoutParams(loLp);
        logoutBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setLoading(true);
                auth.logoutAccount(new AuthManager.Callback() {
                    @Override
                    public void onSuccess(JSONObject data) {
                        setLoading(false);
                        toast("已退出登录");
                        refreshView();
                    }
                    @Override
                    public void onError(String code, String msg) {
                        setLoading(false);
                        toast("已退出登录");
                        refreshView();
                    }
                });
            }
        });
        contentLayout.addView(logoutBtn);
    }

    // ============================================================
    //  模式与手势配置
    // ============================================================

    private void addModeAndGestureSection() {
        // 分区标题
        TextView section = makeSectionTitle("模式选择");
        LinearLayout.LayoutParams sLp = lpMatch();
        sLp.topMargin = dp(24);
        contentLayout.addView(section, sLp);

        // 模式选择按钮行
        LinearLayout modeRow = new LinearLayout(this);
        modeRow.setOrientation(LinearLayout.HORIZONTAL);
        modeRow.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams mrLp = lpMatch();
        mrLp.topMargin = dp(8);
        modeRow.setLayoutParams(mrLp);

        final Button overlayBtn = makeButton("悬浮框模式", 0xFF0EA5E9, dp(8));
        overlayBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        final Button voiceBtn = makeButton("语音播报模式", 0xFF94A3B8, dp(8));
        voiceBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);

        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                0, dp(42), 1f);
        btnLp.rightMargin = dp(6);
        overlayBtn.setLayoutParams(btnLp);
        LinearLayout.LayoutParams btnLp2 = new LinearLayout.LayoutParams(
                0, dp(42), 1f);
        btnLp2.leftMargin = dp(6);
        voiceBtn.setLayoutParams(btnLp2);

        // 当前模式高亮
        final Runnable updateModeButtons = () -> {
            boolean isVoice = gestureConfig.isVoiceMode();
            overlayBtn.setBackground(rounded(isVoice ? 0xFFE2E8F0 : 0xFF0EA5E9, dp(8), Color.TRANSPARENT));
            overlayBtn.setTextColor(isVoice ? 0xFF64748B : 0xFFFFFFFF);
            voiceBtn.setBackground(rounded(isVoice ? 0xFF8B5CF6 : 0xFFE2E8F0, dp(8), Color.TRANSPARENT));
            voiceBtn.setTextColor(isVoice ? 0xFFFFFFFF : 0xFF64748B);
        };
        updateModeButtons.run();

        overlayBtn.setOnClickListener(v -> {
            gestureConfig.setMode(GestureConfig.MODE_OVERLAY);
            updateModeButtons.run();
            restartOverlayIfRunning();
            toast("已切换到悬浮框模式");
        });

        voiceBtn.setOnClickListener(v -> {
            gestureConfig.setMode(GestureConfig.MODE_VOICE);
            updateModeButtons.run();
            restartOverlayIfRunning();
            toast("已切换到语音播报模式");
        });

        modeRow.addView(overlayBtn);
        modeRow.addView(voiceBtn);
        contentLayout.addView(modeRow);

        // 手势说明（固定，无需配置）
        TextView gestureHint = new TextView(this);
        gestureHint.setText("手势说明：单击悬浮球 = 截图搜索，双击悬浮球 = 重听答案（无需配置）");
        gestureHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        gestureHint.setTextColor(0xFF64748B);
        gestureHint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams ghLp = lpMatch();
        ghLp.topMargin = dp(10);
        contentLayout.addView(gestureHint, ghLp);

        // 语速调节（语音播报模式用）
        TextView rateLabel = new TextView(this);
        rateLabel.setText("语音播报语速");
        rateLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        rateLabel.setTextColor(0xFF475569);
        LinearLayout.LayoutParams rlLp = lpMatch();
        rlLp.topMargin = dp(10);
        contentLayout.addView(rateLabel, rlLp);

        SeekBar rateBar = new SeekBar(this);
        rateBar.setMax(20); // 0.5x - 2.5x → 0-20
        rateBar.setProgress((int) ((gestureConfig.getTtsRate() - 0.5f) * 10));
        LinearLayout.LayoutParams rbLp = lpMatch();
        rbLp.topMargin = dp(4);
        rateBar.setLayoutParams(rbLp);
        final TextView rateValue = new TextView(this);
        rateValue.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        rateValue.setTextColor(0xFF64748B);
        rateValue.setGravity(Gravity.CENTER);
        rateValue.setText(String.format("当前：%.1fx", gestureConfig.getTtsRate()));
        rateBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                float rate = 0.5f + progress * 0.1f;
                rateValue.setText(String.format("当前：%.1fx", rate));
            }
            @Override
            public void onStartTrackingTouch(SeekBar bar) {}
            @Override
            public void onStopTrackingTouch(SeekBar bar) {
                float rate = 0.5f + bar.getProgress() * 0.1f;
                gestureConfig.setTtsRate(rate);
                toast("语速已保存");
            }
        });
        contentLayout.addView(rateBar);
        contentLayout.addView(rateValue);
    }

    private void restartOverlayIfRunning() {
        if (OverlayService.isRunning()) {
            Intent svc = new Intent(this, OverlayService.class);
            stopService(svc);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
        }
    }

    // ============================================================
    //  截图权限请求
    // ============================================================

    private void requestScreenCapture() {
        if (ScreenCaptureService.isProjectionReady()) {
            toast("截图权限已开启");
            return;
        }
        try {
            MediaProjectionManager mpm = (MediaProjectionManager)
                    getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (mpm != null) {
                startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_SCREEN_CAPTURE);
            } else {
                toast("无法获取截图服务");
            }
        } catch (Exception e) {
            toast("请求截图权限失败: " + e.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_SCREEN_CAPTURE) {
            // 标记刚从截图授权返回，阻止 onResume 立即重置开关状态
            // （OverlayService 启动是异步的，onResume 可能在服务 onCreate 之前执行）
            justReturnedFromScreenCapture = true;
            if (resultCode == RESULT_OK && data != null) {
                // 启动 ScreenCaptureService（持有 MediaProjection，按需截图）
                Intent svc = new Intent(this, ScreenCaptureService.class);
                svc.putExtra("resultCode", resultCode);
                svc.putExtra("data", data);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(svc);
                } else {
                    startService(svc);
                }
                toast("截图权限已开启，正在启动悬浮球...");
                // 自动启动 OverlayService（用户已通过开关触发）
                if (overlaySwitchRef != null && overlaySwitchRef.isChecked()) {
                    Intent overlay = new Intent(this, OverlayService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(overlay);
                    } else {
                        startService(overlay);
                    }
                    toast("悬浮球已开启");
                }
            } else {
                toast("未授权截图权限，无法识别");
                if (overlaySwitchRef != null) overlaySwitchRef.setChecked(false);
            }
        }
    }

    // ============================================================
    //  WebView 跳转
    // ============================================================

    private void openWebView(String url, String title) {
        Intent intent = new Intent(this, WebViewActivity.class);
        intent.putExtra(WebViewActivity.EXTRA_URL, url);
        intent.putExtra(WebViewActivity.EXTRA_TITLE, title);
        startActivity(intent);
    }

    // ============================================================
    //  UI 工具方法
    // ============================================================

    private EditText makeEditText(String hint, int inputType) {
        EditText et = new EditText(this);
        et.setHint(hint);
        et.setInputType(inputType);
        et.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        et.setPadding(dp(16), dp(14), dp(16), dp(14));
        et.setBackground(rounded(0xFFFFFFFF, dp(10), 0xFFE2E8F0));
        return et;
    }

    private Button makeButton(String text, int color, int radius) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(0xFFFFFFFF);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setBackground(rounded(color, radius, Color.TRANSPARENT));
        b.setPadding(0, dp(4), 0, dp(4));
        return b;
    }

    private Button makeOutlineButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(0xFF0EA5E9);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setBackground(rounded(0xFFFFFFFF, dp(10), 0xFF0EA5E9));
        b.setPadding(0, dp(4), 0, dp(4));
        return b;
    }

    private TextView makeSectionTitle(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setTextColor(0xFF94A3B8);
        tv.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return tv;
    }

    private TextView makeLinkText(String text, final Runnable onClick) {
        SpannableString span = new SpannableString(text);
        span.setSpan(new ClickableSpan() {
            @Override
            public void onClick(View widget) {
                onClick.run();
            }
            @Override
            public void updateDrawState(TextPaint ds) {
                ds.setColor(0xFF0EA5E9);
                ds.setUnderlineText(true);
            }
        }, 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        TextView tv = new TextView(this);
        tv.setText(span);
        tv.setMovementMethod(LinkMovementMethod.getInstance());
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        return tv;
    }

    private TextView makeDualLinkText(String text1, final Runnable onClick1,
                                      String text2, final Runnable onClick2) {
        String full = text1 + "    " + text2;
        SpannableString span = new SpannableString(full);
        span.setSpan(new ClickableSpan() {
            @Override
            public void onClick(View widget) { onClick1.run(); }
            @Override
            public void updateDrawState(TextPaint ds) {
                ds.setColor(0xFF0EA5E9);
                ds.setUnderlineText(true);
            }
        }, 0, text1.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        span.setSpan(new ClickableSpan() {
            @Override
            public void onClick(View widget) { onClick2.run(); }
            @Override
            public void updateDrawState(TextPaint ds) {
                ds.setColor(0xFFF59E0B);
                ds.setUnderlineText(true);
            }
        }, text1.length() + 4, full.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        TextView tv = new TextView(this);
        tv.setText(span);
        tv.setMovementMethod(LinkMovementMethod.getInstance());
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        tv.setGravity(Gravity.CENTER);
        return tv;
    }

    private GradientDrawable rounded(int color, int radius, int strokeColor) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        if (strokeColor != Color.TRANSPARENT) d.setStroke(dp(1), strokeColor);
        return d;
    }

    private LinearLayout.LayoutParams lpMatch() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    private void setLoading(boolean loading) {
        this.loading.setVisibility(loading ? View.VISIBLE : View.GONE);
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 刚从截图授权 Activity 返回时，OverlayService 可能还在异步启动中，
        // 此时 isRunning() 可能仍为 false，直接重置开关会导致用户看到"悬浮球已关闭"的误提示。
        // 延迟 1.5 秒后再次检查：若服务仍未启动，说明启动失败，才重置开关。
        if (justReturnedFromScreenCapture) {
            justReturnedFromScreenCapture = false;
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (overlaySwitchRef != null
                        && overlaySwitchRef.isChecked()
                        && !OverlayService.isRunning()) {
                    overlaySwitchRef.setChecked(false);
                    toast("悬浮球启动失败，请重试");
                }
            }, 1500);
            return;
        }
        // 从其他权限设置页面返回时刷新开关状态
        if (overlaySwitchRef != null && overlaySwitchRef.isChecked() && !OverlayService.isRunning()) {
            overlaySwitchRef.setChecked(false);
        }
    }
}
