package com.quizmate.android;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.text.TextUtils;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import java.util.List;

/**
 * 可选的页面文字读取服务（AccessibilityService）。
 * 用于辅助读取当前屏幕文字，用于学习、练习和复盘分析。
 */
public class AccessibilityReader extends AccessibilityService {
    private static final String TAG = "AccessibilityReader";
    private static volatile String latestText = "";
    private static volatile AccessibilityReader instance;

    public static AccessibilityReader getInstance() {
        return instance;
    }

    public static String getLatestText() {
        return latestText;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        Log.i(TAG, "Accessibility service connected");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // 可选：保持最新屏幕文字
        try {
            String text = readCurrentScreen();
            if (!TextUtils.isEmpty(text)) {
                latestText = text;
            }
        } catch (Exception e) {
            Log.e(TAG, "read error", e);
        }
    }

    @Override
    public void onInterrupt() {
        Log.i(TAG, "Accessibility interrupted");
    }

    @Override
    public boolean onUnbind(Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    /** 读取当前屏幕文字 */
    public String readCurrentScreen() {
        StringBuilder sb = new StringBuilder();
        List<AccessibilityWindowInfo> windows = getWindows();
        if (windows != null) {
            for (AccessibilityWindowInfo window : windows) {
                AccessibilityNodeInfo root = window.getRoot();
                if (root != null) {
                    collectText(root, sb);
                }
            }
        }
        if (sb.length() == 0) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) {
                collectText(root, sb);
            }
        }
        return sb.toString().trim();
    }

    private void collectText(AccessibilityNodeInfo node, StringBuilder sb) {
        if (node == null) return;
        CharSequence text = node.getText();
        if (text != null && text.length() > 0) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(text);
        }
        CharSequence desc = node.getContentDescription();
        if (desc != null && desc.length() > 0) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(desc);
        }
        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                collectText(child, sb);
            }
        }
    }

    /** 主动抓取一次当前屏幕文字 */
    public static String snapshot() {
        AccessibilityReader r = instance;
        if (r == null) return latestText;
        String text = r.readCurrentScreen();
        if (!TextUtils.isEmpty(text)) {
            latestText = text;
        }
        return latestText;
    }
}
