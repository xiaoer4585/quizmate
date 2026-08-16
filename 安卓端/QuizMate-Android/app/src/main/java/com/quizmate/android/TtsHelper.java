package com.quizmate.android;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import java.util.Locale;

/**
 * Android TextToSpeech 封装（与 Windows TtsHelper 对齐）。
 *
 * 使用系统内置 TTS 引擎，零配置、零后端依赖。
 * 支持中文播报、中断、语速调节。
 */
public class TtsHelper {
    private static final String TAG = "QuizMateTts";

    private TextToSpeech tts;
    private volatile boolean ready = false;
    private float rate = 1.0f;

    /** 播报完成回调 */
    public interface Callback {
        void onDone();
    }

    public TtsHelper(Context context) {
        tts = new TextToSpeech(context.getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
                if (result == TextToSpeech.LANG_MISSING_DATA
                        || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "Simplified Chinese not available, trying CHINESE");
                    tts.setLanguage(Locale.CHINESE);
                }
                ready = true;
                Log.i(TAG, "TTS engine ready");
            } else {
                Log.e(TAG, "TTS init failed: " + status);
            }
        });
    }

    public void setRate(float rate) {
        this.rate = Math.max(0.1f, Math.min(3.0f, rate));
    }

    public boolean isReady() {
        return ready;
    }

    public boolean isSpeaking() {
        return tts != null && tts.isSpeaking();
    }

    /** 播报文本（中断当前播报） */
    public void speak(String text, Callback callback) {
        if (tts == null || !ready || text == null || text.trim().isEmpty()) {
            if (callback != null) callback.onDone();
            return;
        }
        tts.setSpeechRate(rate);
        String utteranceId = "quizmate_answer";
        if (callback != null) {
            tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                @Override
                public void onStart(String id) {}

                @Override
                public void onDone(String id) {
                    callback.onDone();
                }

                @Override
                public void onError(String id) {
                    callback.onDone();
                }
            });
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
    }

    public void stop() {
        if (tts != null) {
            tts.stop();
        }
    }

    public void shutdown() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
            ready = false;
        }
    }
}
