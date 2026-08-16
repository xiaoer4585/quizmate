package com.quizmate.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;
import android.app.Notification.Builder;

import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 基于 MediaProjection + ImageReader 的按需截图前台服务。
 *
 * 改造要点（1.3.0）：
 *  - 不再持续创建 VirtualDisplay，避免屏幕上长期显示「共享中」状态条。
 *  - MediaProjection 保持存活（免去重复授权），但仅在 captureOnce() 时
 *    短暂创建 VirtualDisplay 抓取一帧后立即释放，「共享中」只会闪现不到 1 秒。
 *  - 通过 captureOnce(CaptureCallback) 获取一次性截图。
 */
public class ScreenCaptureService extends Service {
    private static final String TAG = "ScreenCapture";
    private static final String CHANNEL_ID = "quizmate_capture";
    private static final int NOTIFICATION_ID = 0x2A01;

    public interface CaptureCallback {
        void onCaptured(Bitmap bitmap);
        void onError(String message);
    }

    private MediaProjectionManager projectionManager;
    private MediaProjection projection;
    private int width;
    private int height;
    private int density;

    private static volatile ScreenCaptureService instance;
    private static volatile boolean running;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static boolean isRunning() {
        return running;
    }

    /** 判断 MediaProjection 是否就绪，可用于悬浮球点击前检查 */
    public static boolean isProjectionReady() {
        return running && instance != null && instance.projection != null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        running = true;
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        int resultCode = intent.getIntExtra("resultCode", 0);
        Intent data = intent.getParcelableExtra("data");
        if (data == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        projectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        try {
            if (projection == null) {
                projection = projectionManager.getMediaProjection(resultCode, data);
                projection.registerCallback(projectionCallback, new Handler(Looper.getMainLooper()));
            }
        } catch (Exception e) {
            Log.e(TAG, "getMediaProjection failed", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (projection == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        resolveDisplaySize();
        return START_STICKY;
    }

    private void resolveDisplaySize() {
        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        wm.getDefaultDisplay().getRealMetrics(metrics);
        width = metrics.widthPixels;
        height = metrics.heightPixels;
        density = metrics.densityDpi;
    }

    /**
     * 按需截取一帧：短暂创建 VirtualDisplay，拿到首帧后立即释放，
     * 从而把「共享中」提示限制在不到 1 秒的闪现范围内。
     */
    public static void captureOnce(CaptureCallback callback) {
        ScreenCaptureService svc = instance;
        if (svc == null || svc.projection == null) {
            callback.onError("截图服务未就绪，请先开启截图权限");
            return;
        }
        svc.performCapture(callback);
    }

    private void performCapture(final CaptureCallback callback) {
        final Handler mainHandler = new Handler(Looper.getMainLooper());
        if (width == 0 || height == 0) {
            resolveDisplaySize();
        }
        final int captureWidth = width;
        final int captureHeight = height;

        final ImageReader reader = ImageReader.newInstance(
                captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);

        final AtomicReference<Boolean> done = new AtomicReference<>(false);
        final VirtualDisplay[] displayHolder = new VirtualDisplay[1];

        final Runnable cleanup = () -> {
            try {
                if (displayHolder[0] != null) {
                    displayHolder[0].release();
                    displayHolder[0] = null;
                }
            } catch (Exception ignored) {
            }
            try {
                reader.setOnImageAvailableListener(null, null);
                reader.close();
            } catch (Exception ignored) {
            }
        };

        // 超时保护：2 秒内未拿到帧则报错并清理
        mainHandler.postDelayed(() -> {
            if (done.compareAndSet(false, true)) {
                cleanup.run();
                callback.onError("截图超时，请重试");
            }
        }, 2000);

        reader.setOnImageAvailableListener(r -> {
            Image image = null;
            try {
                image = r.acquireLatestImage();
                if (image == null) return;
                if (!done.compareAndSet(false, true)) {
                    return;
                }
                Image.Plane[] planes = image.getPlanes();
                if (planes.length == 0) {
                    mainHandler.post(() -> callback.onError("截图数据为空"));
                    return;
                }
                ByteBuffer buffer = planes[0].getBuffer();
                int pixelStride = planes[0].getPixelStride();
                int rowStride = planes[0].getRowStride();
                int rowPadding = rowStride - pixelStride * captureWidth;
                int bmpWidth = captureWidth + rowPadding / pixelStride;
                Bitmap bmp = Bitmap.createBitmap(bmpWidth, captureHeight, Bitmap.Config.ARGB_8888);
                buffer.rewind();
                bmp.copyPixelsFromBuffer(buffer);
                if (bmpWidth != captureWidth) {
                    Bitmap cropped = Bitmap.createBitmap(bmp, 0, 0, captureWidth, captureHeight);
                    bmp.recycle();
                    bmp = cropped;
                }
                final Bitmap result = bmp;
                mainHandler.post(() -> callback.onCaptured(result));
            } catch (Exception e) {
                Log.e(TAG, "image process error", e);
                mainHandler.post(() -> callback.onError("截图处理失败"));
            } finally {
                if (image != null) image.close();
                cleanup.run();
            }
        }, mainHandler);

        try {
            VirtualDisplay vd = projection.createVirtualDisplay("QuizMateCapture",
                    captureWidth, captureHeight, density,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    reader.getSurface(), null, null);
            displayHolder[0] = vd;
        } catch (Exception e) {
            Log.e(TAG, "createVirtualDisplay failed", e);
            if (done.compareAndSet(false, true)) {
                cleanup.run();
                callback.onError("截图启动失败");
            }
        }
    }

    private final MediaProjection.Callback projectionCallback = new MediaProjection.Callback() {
        @Override
        public void onStop() {
            projection = null;
            stopSelf();
        }
    };

    @Override
    public void onDestroy() {
        if (projection != null) {
            try {
                projection.unregisterCallback(projectionCallback);
                projection.stop();
            } catch (Exception ignored) {
            }
            projection = null;
        }
        instance = null;
        running = false;
        super.onDestroy();
    }

    private void createChannel() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                    getString(R.string.capture_channel),
                    NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Builder(this, CHANNEL_ID);
        } else {
            b = new Builder(this);
        }
        b.setSmallIcon(android.R.drawable.ic_menu_camera);
        b.setContentTitle(getString(R.string.capture_channel));
        b.setContentText(getString(R.string.capture_notification_text));
        b.setOngoing(true);
        b.setPriority(Notification.PRIORITY_LOW);
        return b.build();
    }
}
