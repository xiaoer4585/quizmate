package com.quizmate.android;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 模式配置管理（SharedPreferences 持久化）。
 *
 * 支持两种模式：
 *   - MODE_OVERLAY: 截图识别 → 弹出答案面板
 *   - MODE_VOICE:   截图识别 → TTS 语音播报答案
 *
 * 手势固定：单击=搜索，双击=重听（两种模式一致，无需配置）。
 */
public class GestureConfig {
    private static final String PREFS = "quizmate_gesture";
    private static final String KEY_MODE = "mode";
    private static final String KEY_TTS_RATE = "tts_rate";

    public static final String MODE_OVERLAY = "overlay";
    public static final String MODE_VOICE = "voice";

    private final SharedPreferences prefs;

    public GestureConfig(Context context) {
        prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public String getMode() {
        return prefs.getString(KEY_MODE, MODE_OVERLAY);
    }

    public void setMode(String mode) {
        prefs.edit().putString(KEY_MODE, mode).apply();
    }

    public boolean isVoiceMode() {
        return MODE_VOICE.equals(getMode());
    }

    public float getTtsRate() {
        return prefs.getFloat(KEY_TTS_RATE, 1.0f);
    }

    public void setTtsRate(float rate) {
        prefs.edit().putFloat(KEY_TTS_RATE, rate).apply();
    }
}
