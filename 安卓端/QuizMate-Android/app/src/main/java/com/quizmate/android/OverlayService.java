package com.quizmate.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.GestureDetector;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 悬浮球 + 答案面板服务。
 *
 * 两种模式（用户在管理页面切换）：
 *
 *   1. 悬浮框模式（overlay）：
 *      单击 → 截图 → AI 分析（悬浮球蓝色旋转）→ 自动弹出答案面板
 *      双击 → 重听（重新弹出上次答案面板）
 *
 *   2. 语音播报模式（voice）：
 *      单击 → 截图 → AI 分析（悬浮球无任何变化）→ TTS 语音播报答案
 *      双击 → 重听（重新播报上次答案）
 *
 * 手势固定：单击=搜索，双击=重听（两种模式一致，无需配置）。
 * 拖动 = 移动悬浮球位置。
 */
public class OverlayService extends Service {
    private static final String TAG = "QuizMateOverlay";
    private static final int NOTIFICATION_ID = 62815;
    private static final String CHANNEL_ID = "quizmate_floating";

    private static volatile boolean running = false;

    public static boolean isRunning() {
        return running;
    }

    private enum Mode { IDLE, ANALYZING, SHOWING, SPEAKING }
    private Mode mode = Mode.IDLE;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();

    private WindowManager windowManager;
    private AuthManager auth;
    private GestureConfig gestureConfig;
    private TtsHelper ttsHelper;

    // 悬浮球
    private SecureBubbleView bubbleView;
    private WindowManager.LayoutParams bubbleParams;
    private GestureDetector gestureDetector;
    private int bubbleSize;

    // 答案面板（overlay 模式）
    private View panelView;
    private LinearLayout panelCard;
    private float panelOpacity = 0.92f;

    // 状态
    private boolean analyzing = false;
    private int analysisGeneration = 0;

    // 缓存上次答案（用于重听）
    private String lastAnswerText = "";
    private String lastAnswerOnly = "";

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        auth = new AuthManager(this);
        gestureConfig = new GestureConfig(this);
        try {
            ttsHelper = new TtsHelper(this);
            ttsHelper.setRate(gestureConfig.getTtsRate());
        } catch (Exception e) {
            Log.e(TAG, "TTS init error", e);
        }
        bubbleSize = dp(56);
        createNotificationChannel();
        // Android 14+ 需要指定 foregroundServiceType
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, buildNotification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification());
        }
        try {
            showBubble();
        } catch (Exception e) {
            Log.e(TAG, "showBubble failed", e);
            toast("悬浮球显示失败，请检查悬浮窗权限");
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (bubbleView == null) {
            showBubble();
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        analysisGeneration++;
        analyzing = false;
        running = false;
        mode = Mode.IDLE;
        executor.shutdownNow();
        if (ttsHelper != null) {
            ttsHelper.shutdown();
            ttsHelper = null;
        }
        removePanel();
        removeBubble();
        super.onDestroy();
    }

    // ============================================================
    //  悬浮球
    // ============================================================

    private void showBubble() {
        if (!Settings.canDrawOverlays(this) || bubbleView != null) return;

        bubbleView = new SecureBubbleView(this);
        gestureDetector = new GestureDetector(this, new GestureListener());
        gestureDetector.setOnDoubleTapListener(new GestureListener());
        bubbleView.setOnTouchListener(new BubbleTouchListener());

        bubbleParams = new WindowManager.LayoutParams(
                bubbleSize,
                bubbleSize,
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                android.graphics.PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dp(20);
        bubbleParams.y = dp(160);

        windowManager.addView(bubbleView, bubbleParams);
    }

    private void removeBubble() {
        if (bubbleView != null) {
            try {
                windowManager.removeView(bubbleView);
            } catch (Exception ignored) {
            }
            bubbleView = null;
        }
    }

    private void setBubbleVisible(boolean visible) {
        if (bubbleView != null) {
            bubbleView.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
        }
    }

    private void setBubbleBusy(boolean busy) {
        if (bubbleView != null) {
            bubbleView.setBusy(busy);
        }
    }

    // ============================================================
    //  手势检测：单击=搜索，双击=重听（固定，无需配置）
    // ============================================================

    private class GestureListener extends GestureDetector.SimpleOnGestureListener {
        @Override
        public boolean onSingleTapConfirmed(MotionEvent e) {
            onSearchGesture();
            return true;
        }

        @Override
        public boolean onDoubleTap(MotionEvent e) {
            onReplayGesture();
            return true;
        }
    }

    /** 单击：触发截图 + AI 分析 */
    private void onSearchGesture() {
        switch (mode) {
            case IDLE:
                startAnalysis();
                break;
            case ANALYZING:
                toast("正在分析，请稍等");
                break;
            case SHOWING:
                closePanel();
                startAnalysis();
                break;
            case SPEAKING:
                stopSpeaking();
                startAnalysis();
                break;
        }
    }

    /** 双击：重听（重新播报/弹出上次答案） */
    private void onReplayGesture() {
        if (mode == Mode.ANALYZING) {
            toast("正在分析，请稍等");
            return;
        }
        if (lastAnswerText.isEmpty()) {
            toast("暂无答案可重听");
            return;
        }
        if (gestureConfig.isVoiceMode()) {
            if (mode == Mode.SPEAKING) {
                ttsHelper.stop();
            }
            speakAnswer(lastAnswerOnly.isEmpty() ? lastAnswerText : lastAnswerOnly);
        } else {
            removePanel();
            showResultPanel("参考答案（重听）", lastAnswerText, lastAnswerOnly);
            mode = Mode.SHOWING;
            setBubbleVisible(true);
        }
    }

    // ============================================================
    //  截图 + AI 分析
    // ============================================================

    private void startAnalysis() {
        if (!auth.isLoggedIn()) {
            toast("请先登录账号");
            return;
        }
        if (!ScreenCaptureService.isProjectionReady()) {
            toast("请先开启截图权限");
            return;
        }

        int generation = ++analysisGeneration;
        analyzing = true;
        mode = Mode.ANALYZING;

        boolean voiceMode = gestureConfig.isVoiceMode();

        if (!voiceMode) {
            // 悬浮框模式：隐藏悬浮球 + 显示忙碌动效
            setBubbleBusy(true);
            setBubbleVisible(false);
            toast("正在识别当前屏幕");
        }
        // 语音播报模式：悬浮球无任何变化，静默截图

        // 悬浮框模式需要等悬浮球隐藏后再截图；语音模式直接截图
        int delay = voiceMode ? 50 : 350;
        handler.postDelayed(() -> {
            if (generation != analysisGeneration) return;
            captureAndAnalyze(generation);
        }, delay);
    }

    private void captureAndAnalyze(int generation) {
        ScreenCaptureService.captureOnce(new ScreenCaptureService.CaptureCallback() {
            @Override
            public void onCaptured(Bitmap bitmap) {
                executor.execute(() -> {
                    try {
                        if (!gestureConfig.isVoiceMode()) {
                            // 悬浮框模式：截图后重新显示悬浮球（忙碌状态）
                            handler.post(() -> {
                                if (generation == analysisGeneration) {
                                    setBubbleVisible(true);
                                }
                            });
                        }

                        byte[] imageBytes = compressBitmap(bitmap);
                        bitmap.recycle();

                        if (generation != analysisGeneration) return;

                        Log.i(TAG, "Screenshot compressed: " + imageBytes.length + " bytes");

                        String token = auth.getToken();
                        String deviceId = auth.getDeviceId();

                        JSONObject uploadParams = new JSONObject();
                        uploadParams.put("accountToken", token);
                        uploadParams.put("deviceId", deviceId);
                        uploadParams.put("contentType", "image/jpeg");
                        uploadParams.put("sizeBytes", imageBytes.length);

                        JSONObject uploadResp = auth.postAction("createScreenshotUpload", uploadParams);
                        if (!uploadResp.optBoolean("ok")) {
                            postError(generation, uploadResp.optString("error", "上传地址获取失败"));
                            return;
                        }

                        JSONObject uploadData = uploadResp.optJSONObject("data");
                        if (uploadData == null) {
                            postError(generation, "上传地址响应格式错误");
                            return;
                        }

                        String uploadUrl = uploadData.optString("uploadUrl", "");
                        String screenshotUrl = uploadData.optString("screenshotUrl", "");
                        String objectKey = uploadData.optString("objectKey", "");
                        String uploadTicket = uploadData.optString("uploadTicket", "");

                        if (uploadUrl.isEmpty() || screenshotUrl.isEmpty()) {
                            postError(generation, "上传地址为空");
                            return;
                        }

                        if (!uploadToOss(uploadUrl, "image/jpeg", imageBytes)) {
                            postError(generation, "截图上传到 OSS 失败");
                            return;
                        }

                        if (generation != analysisGeneration) return;

                        String requestId = "android-" + UUID.randomUUID().toString();
                        JSONObject analyzeParams = new JSONObject();
                        analyzeParams.put("accountToken", token);
                        analyzeParams.put("deviceId", deviceId);
                        analyzeParams.put("requestId", requestId);
                        analyzeParams.put("source", "screen");
                        analyzeParams.put("screenshotUrl", screenshotUrl);
                        analyzeParams.put("objectKey", objectKey);
                        analyzeParams.put("uploadTicket", uploadTicket);

                        JSONObject analyzeResp = auth.postAction("analyze", analyzeParams);
                        if (!analyzeResp.optBoolean("ok")) {
                            String error = analyzeResp.optString("error", "分析失败");
                            Log.e(TAG, "Analyze failed: " + error);
                            postError(generation, error);
                            return;
                        }

                        JSONObject data = analyzeResp.optJSONObject("data");
                        if (data == null) {
                            postError(generation, "分析结果为空");
                            return;
                        }

                        Log.i(TAG, "Analyze success!");
                        postResult(generation, data);

                    } catch (Exception e) {
                        Log.e(TAG, "Analysis error", e);
                        postError(generation, e.getMessage() == null ? "分析失败" : e.getMessage());
                    }
                });
            }

            @Override
            public void onError(String message) {
                postError(generation, message == null ? "截图失败" : message);
            }
        });
    }

    private byte[] compressBitmap(Bitmap bitmap) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int quality = 85;
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output);
        byte[] bytes = output.toByteArray();
        while (bytes.length > 3 * 1024 * 1024 && quality > 40) {
            quality -= 10;
            ByteArrayOutputStream retry = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, retry);
            bytes = retry.toByteArray();
        }
        return bytes;
    }

    private boolean uploadToOss(String uploadUrl, String contentType, byte[] body) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(uploadUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PUT");
            conn.setRequestProperty("Content-Type", contentType);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body);
            os.flush();
            os.close();
            int code = conn.getResponseCode();
            Log.i(TAG, "OSS PUT response: " + code);
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.e(TAG, "OSS upload error", e);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void postError(int generation, String message) {
        handler.post(() -> {
            if (generation != analysisGeneration) return;
            analyzing = false;
            mode = Mode.IDLE;
            // 悬浮框模式恢复悬浮球；语音模式悬浮球本来就没变化
            setBubbleBusy(false);
            setBubbleVisible(true);
            toast(message == null || message.trim().isEmpty() ? "分析失败" : message);
        });
    }

    /** 分析完成：根据模式决定弹面板还是 TTS 播报 */
    private void postResult(int generation, JSONObject data) {
        handler.post(() -> {
            if (generation != analysisGeneration) return;
            analyzing = false;
            setBubbleBusy(false);

            String[] parsed = parseAnswer(data);
            lastAnswerText = parsed[0];
            lastAnswerOnly = parsed[1];

            if (gestureConfig.isVoiceMode()) {
                // 语音播报模式：悬浮球无变化，直接 TTS 播报
                setBubbleVisible(true);
                speakAnswer(lastAnswerOnly.isEmpty() ? lastAnswerText : lastAnswerOnly);
            } else {
                // 悬浮框模式：弹出答案面板
                mode = Mode.SHOWING;
                setBubbleVisible(true);
                showResultPanel("参考答案", lastAnswerText, lastAnswerOnly);
            }
        });
    }

    // ============================================================
    //  语音播报
    // ============================================================

    private void speakAnswer(String text) {
        if (ttsHelper == null) {
            toast("语音引擎初始化失败，请检查手机 TTS 设置");
            mode = Mode.IDLE;
            return;
        }
        if (!ttsHelper.isReady()) {
            toast("语音引擎未就绪，请稍后再试");
            mode = Mode.IDLE;
            return;
        }
        mode = Mode.SPEAKING;
        ttsHelper.speak(text, () -> {
            handler.post(() -> {
                if (mode == Mode.SPEAKING) {
                    mode = Mode.IDLE;
                }
            });
        });
    }

    private void stopSpeaking() {
        if (ttsHelper != null) {
            ttsHelper.stop();
        }
        if (mode == Mode.SPEAKING) {
            mode = Mode.IDLE;
        }
    }

    // ============================================================
    //  解析 AI 结果
    // ============================================================

    private String[] parseAnswer(JSONObject data) {
        String displayText;
        String answerOnly;

        JSONArray items = data.optJSONArray("items");
        if (items != null && items.length() > 0) {
            StringBuilder display = new StringBuilder();
            StringBuilder answers = new StringBuilder();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String answer = item.optString("answer", "").trim();
                String explanation = item.optString("explanation", "").trim();
                String no = item.optString("questionNo", "").trim();
                if (no.isEmpty()) no = String.valueOf(i + 1);
                display.append("题目").append(no).append("：答案：")
                        .append(answer.isEmpty() ? "待确认" : answer).append('\n')
                        .append("---答案解析---\n")
                        .append(explanation.isEmpty() ? "暂无解析" : explanation)
                        .append("\n\n");
                if (!answer.isEmpty()) {
                    if (answers.length() > 0) answers.append('\n');
                    answers.append(answer);
                }
            }
            displayText = display.toString().trim();
            answerOnly = answers.toString().trim();
        } else {
            String answer = data.optString("answer", "").trim();
            String explanation = data.optString("explanation", "").trim();
            if (!answer.isEmpty()) {
                answerOnly = answer;
                displayText = "答案：" + answer + "\n---答案解析---\n"
                        + (explanation.isEmpty() ? "暂无解析" : explanation);
            } else {
                answerOnly = "";
                displayText = data.optString("summary", "")
                        .concat(data.optString("note", ""))
                        .concat(data.optString("raw", ""));
                if (displayText.isEmpty()) displayText = data.toString();
            }
        }
        return new String[]{displayText, answerOnly};
    }

    // ============================================================
    //  答案面板（overlay 模式，底部显示，不遮挡悬浮球）
    // ============================================================

    private void showResultPanel(String title, String body, String answerOnly) {
        removePanel();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);

        panelCard = new LinearLayout(this);
        panelCard.setOrientation(LinearLayout.VERTICAL);
        panelCard.setPadding(dp(16), dp(14), dp(16), dp(12));
        panelCard.setBackground(rounded(Color.WHITE, dp(14), Color.rgb(186, 230, 253)));
        applyPanelOpacity();

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView titleView = makeText(title, 15, Color.rgb(12, 74, 110), true);
        titleRow.addView(titleView, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView opacityLabel = makeText("透明度", 11, Color.rgb(100, 116, 139), false);
        titleRow.addView(opacityLabel);
        SeekBar opacityBar = new SeekBar(this);
        opacityBar.setMax(70);
        opacityBar.setProgress((int) (panelOpacity * 100 - 30));
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(dp(80), dp(28));
        barLp.setMargins(dp(4), 0, 0, 0);
        opacityBar.setLayoutParams(barLp);
        opacityBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                panelOpacity = (progress + 30) / 100f;
                applyPanelOpacity();
            }
            @Override
            public void onStartTrackingTouch(SeekBar bar) {}
            @Override
            public void onStopTrackingTouch(SeekBar bar) {}
        });
        titleRow.addView(opacityBar);
        panelCard.addView(titleRow);

        ScrollView scroll = new ScrollView(this);
        TextView bodyView = makeText(body, 14, Color.rgb(31, 45, 63), false);
        bodyView.setLineSpacing(0, 1.18f);
        scroll.addView(bodyView);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(240));
        scrollParams.setMargins(0, dp(8), 0, dp(8));
        panelCard.addView(scroll, scrollParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);

        Button copyButton = makeButton("复制答案", Color.rgb(14, 165, 233));
        final String answerText = answerOnly;
        copyButton.setEnabled(answerOnly != null && !answerOnly.trim().isEmpty());
        copyButton.setOnClickListener(v -> copyAnswer(answerText));
        actions.addView(copyButton, new LinearLayout.LayoutParams(0, dp(42), 1f));

        Button closeButton = makeButton("关闭", Color.rgb(224, 242, 254));
        closeButton.setTextColor(Color.rgb(2, 132, 199));
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(0, dp(42), 1f);
        closeLp.setMargins(dp(8), 0, 0, 0);
        closeButton.setOnClickListener(v -> closePanel());
        actions.addView(closeButton, closeLp);
        panelCard.addView(actions);

        TextView hint = makeText("只复制答案，不复制解析 · 点击悬浮球可关闭 · 双击悬浮球重听", 11, Color.rgb(71, 85, 105), false);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(8), 0, 0);
        panelCard.addView(hint);

        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cardLp.setMargins(dp(14), 0, dp(14), dp(26));
        root.addView(panelCard, cardLp);

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                android.graphics.PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.BOTTOM;
        panelView = root;
        windowManager.addView(panelView, params);
    }

    private void applyPanelOpacity() {
        if (panelCard != null) {
            panelCard.setAlpha(panelOpacity);
        }
    }

    private void removePanel() {
        if (panelView != null) {
            try {
                windowManager.removeView(panelView);
            } catch (Exception ignored) {
            }
            panelView = null;
            panelCard = null;
        }
    }

    private void closePanel() {
        removePanel();
        mode = Mode.IDLE;
        setBubbleBusy(false);
        setBubbleVisible(true);
    }

    // ============================================================
    //  复制答案
    // ============================================================

    private void copyAnswer(String answerOnly) {
        String text = answerOnly == null ? "" : answerOnly.trim();
        if (text.isEmpty()) {
            toast("没有可复制的答案");
            return;
        }
        ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (cm != null) {
            cm.setPrimaryClip(ClipData.newPlainText("answer", text));
            toast("答案已复制");
        }
    }

    // ============================================================
    //  工具方法
    // ============================================================

    private int overlayType() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        }
        return WindowManager.LayoutParams.TYPE_PHONE;
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_launcher);
        b.setContentTitle(getString(R.string.notification_title));
        b.setContentText(getString(R.string.notification_text));
        b.setOngoing(true);
        return b.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private TextView makeText(String value, int sp, int color, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return tv;
    }

    private Button makeButton(String text, int bgColor) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setAllCaps(false);
        btn.setTextSize(14);
        btn.setTextColor(Color.WHITE);
        btn.setBackground(rounded(bgColor, dp(10), Color.TRANSPARENT));
        return btn;
    }

    private GradientDrawable rounded(int color, int radius, int strokeColor) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        if (strokeColor != Color.TRANSPARENT) d.setStroke(dp(1), strokeColor);
        return d;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    // ============================================================
    //  悬浮球触摸：手势检测 + 拖动
    // ============================================================

    private class BubbleTouchListener implements View.OnTouchListener {
        private int startX, startY;
        private float downX, downY;
        private boolean moved;

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            gestureDetector.onTouchEvent(event);

            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    startX = bubbleParams.x;
                    startY = bubbleParams.y;
                    downX = event.getRawX();
                    downY = event.getRawY();
                    moved = false;
                    if (bubbleView != null) bubbleView.onPress();
                    return true;

                case MotionEvent.ACTION_MOVE:
                    if (event.getPointerCount() == 1) {
                        int dx = (int) (event.getRawX() - downX);
                        int dy = (int) (event.getRawY() - downY);
                        if (Math.abs(dx) > dp(5) || Math.abs(dy) > dp(5)) {
                            moved = true;
                            bubbleParams.x = Math.max(0, startX + dx);
                            bubbleParams.y = Math.max(0, startY + dy);
                            try {
                                windowManager.updateViewLayout(bubbleView, bubbleParams);
                            } catch (Exception ignored) {
                            }
                        }
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    if (bubbleView != null) bubbleView.onRelease();
                    return true;

                default:
                    return true;
            }
        }
    }
}
