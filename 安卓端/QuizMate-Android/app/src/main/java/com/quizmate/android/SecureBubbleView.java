package com.quizmate.android;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.view.View;
import android.view.animation.OvershootInterpolator;

/**
 * iPhone AssistiveTouch 风格悬浮球。
 *
 * 视觉状态：
 *   - 默认空闲：玻璃质感圆球
 *   - 分析中（busy）：蓝色转圈动效（仅悬浮框模式使用）
 *
 * 注意：语音播报模式下不调用 setBusy，悬浮球始终保持默认外观。
 */
class SecureBubbleView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float density;

    private boolean busy;
    private float busyAngle;
    private float scale = 1.0f;
    private float targetScale = 1.0f;
    private ValueAnimator scaleAnimator;

    SecureBubbleView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
    }

    void setBusy(boolean busy) {
        if (this.busy != busy) {
            this.busy = busy;
            if (busy) {
                animateScaleTo(1.1f);
                startBusyAnimation();
            } else {
                animateScaleTo(1.0f);
            }
            invalidate();
        }
    }

    /** 点击按下时放大 */
    void onPress() {
        animateScaleTo(1.18f);
    }

    /** 松开后恢复 */
    void onRelease() {
        animateScaleTo(busy ? 1.1f : 1.0f);
    }

    private void animateScaleTo(float target) {
        targetScale = target;
        if (scaleAnimator != null && scaleAnimator.isRunning()) {
            scaleAnimator.cancel();
        }
        scaleAnimator = ValueAnimator.ofFloat(scale, target);
        scaleAnimator.setDuration(180);
        scaleAnimator.setInterpolator(new OvershootInterpolator(2.0f));
        scaleAnimator.addUpdateListener(a -> {
            scale = (float) a.getAnimatedValue();
            invalidate();
        });
        scaleAnimator.start();
    }

    private void startBusyAnimation() {
        if (!busy) return;
        busyAngle += 14f;
        if (busyAngle >= 360) busyAngle -= 360;
        invalidate();
        if (busy) {
            postOnAnimation(this::startBusyAnimation);
        }
    }

    private int dp(int value) {
        return (int) (value * density + 0.5f);
    }

    private float dpf(float value) {
        return value * density;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        float cx = w / 2f;
        float cy = h / 2f;

        canvas.save();
        canvas.scale(scale, scale, cx, cy);

        float r = Math.min(w, h) / 2f - dpf(2);

        // 外圈半透明背景
        paint.setAntiAlias(true);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(200, 245, 245, 245));
        canvas.drawCircle(cx, cy, r, paint);

        // 内圈玻璃质感渐变
        paint.setStyle(Paint.Style.FILL);
        Shader shader = new LinearGradient(
                cx, cy - r * 0.6f, cx, cy + r * 0.6f,
                Color.argb(220, 255, 255, 255),
                Color.argb(160, 220, 230, 240),
                Shader.TileMode.CLAMP);
        paint.setShader(shader);
        canvas.drawCircle(cx, cy, r * 0.78f, paint);
        paint.setShader(null);

        // 细边框
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dpf(1.2f));
        paint.setColor(Color.argb(120, 150, 160, 170));
        canvas.drawCircle(cx, cy, r - dpf(0.5f), paint);

        // 忙碌时：蓝色转圈动效（仅悬浮框模式）
        if (busy) {
            float ringR = r * 0.82f;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dpf(2.5f));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(Color.argb(50, 14, 165, 233));
            canvas.drawCircle(cx, cy, ringR, paint);

            paint.setColor(Color.argb(230, 14, 165, 233));
            canvas.drawArc(
                    cx - ringR, cy - ringR, cx + ringR, cy + ringR,
                    busyAngle, 110, false, paint);
            paint.setStrokeCap(Paint.Cap.BUTT);
        }

        canvas.restore();
    }

    @Override
    protected void onDetachedFromWindow() {
        if (scaleAnimator != null) scaleAnimator.cancel();
        super.onDetachedFromWindow();
    }
}
