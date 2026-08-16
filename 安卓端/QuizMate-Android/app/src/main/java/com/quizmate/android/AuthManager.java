package com.quizmate.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * 账号认证管理：统一 POST 到单一 API 端点。
 * 请求体: {action, ...params}；accountToken 放在请求体内。
 * 响应体: {ok:true, data} 或 {ok:false, code, error}。
 *
 * 与 Windows 客户端 AuthManager.ts 完全对应：
 *   - loginAccount: {email, password, deviceId, platform, appVersion} -> {account, token}
 *   - getAccountProfile: {accountToken} -> {account, costPerSuccess}
 *   - logoutAccount: {accountToken}
 */
public class AuthManager {
    private static final String TAG = "QuizMateAuth";
    private static final String PREFS_NAME = "quizmate_auth";
    private static final String KEY_TOKEN = "account_token";
    private static final String KEY_EMAIL = "account_email";
    private static final String KEY_NICKNAME = "account_nickname";
    private static final String KEY_EXPIRE = "account_expire";
    private static final String KEY_CREDITS = "account_credits";
    private static final String KEY_DEVICE_ID = "device_id";

    // 统一 API 端点，与 Windows 客户端 config.json 中的 apiBaseUrl 一致
    static final String API_ENDPOINT = "https://api.quizmate.vip/study-auth-api";
    static final String APP_VERSION = "1.1.0";
    static final String PLATFORM = "android";

    // 注册/忘记密码/充值的官网地址（与 Windows 客户端 ConfigHelper.ts 一致）
    // 移动端通过应用内 WebView 加载，实现自闭环
    public static final String REGISTER_URL = "https://www.quizmate.vip/#credits";
    public static final String RESET_PASSWORD_URL = "https://www.quizmate.vip/#credits";
    public static final String RECHARGE_URL = "https://www.quizmate.vip/recharge.html";
    public static final String OFFICIAL_URL = "https://www.quizmate.vip";

    public interface Callback {
        void onSuccess(JSONObject data);
        void onError(String code, String message);
    }

    private final Context context;

    public AuthManager(Context context) {
        this.context = context.getApplicationContext();
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public String getToken() {
        return prefs().getString(KEY_TOKEN, null);
    }

    public boolean isLoggedIn() {
        String token = getToken();
        if (token == null || token.isEmpty()) return false;
        long expire = prefs().getLong(KEY_EXPIRE, 0L);
        return expire == 0 || System.currentTimeMillis() < expire;
    }

    public void clear() {
        prefs().edit().clear().apply();
    }

    public String getDeviceId() {
        String id = prefs().getString(KEY_DEVICE_ID, null);
        if (id == null || id.isEmpty()) {
            id = "android-" + UUID.randomUUID().toString();
            prefs().edit().putString(KEY_DEVICE_ID, id).apply();
        }
        return id;
    }

    public int getCredits() {
        return prefs().getInt(KEY_CREDITS, 0);
    }

    public String getDisplayName() {
        String nick = prefs().getString(KEY_NICKNAME, null);
        if (nick != null && !nick.isEmpty()) return nick;
        String email = prefs().getString(KEY_EMAIL, "");
        return email == null ? "" : email;
    }

    /**
     * 登录账号: action=loginAccount
     * 请求: {action, email, password, deviceId, platform, appVersion}
     * 响应: {ok:true, data:{account:{...}, token:"...", expiresAt:"..."}}
     */
    public void loginAccount(final String email, final String password, final Callback callback) {
        final JSONObject body = new JSONObject();
        try {
            body.put("action", "loginAccount");
            body.put("email", email);
            body.put("password", password);
            body.put("deviceId", getDeviceId());
            body.put("platform", PLATFORM);
            body.put("appVersion", APP_VERSION);
        } catch (Exception e) {
            postError(callback, "local", "构建请求失败");
            return;
        }
        runAsync(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject resp = postJson(API_ENDPOINT, body);
                    if (resp.optBoolean("ok")) {
                        Object d = resp.opt("data");
                        JSONObject data = d instanceof JSONObject ? (JSONObject) d : new JSONObject();
                        // Windows 客户端: data.token (不是 accountToken)
                        String token = data.optString("token", "");
                        if (token.isEmpty()) token = data.optString("accountToken", "");
                        // data.account 包含邮箱、积分等
                        JSONObject account = data.optJSONObject("account");
                        String savedEmail = email;
                        String nick = "";
                        int credits = 0;
                        if (account != null) {
                            savedEmail = account.optString("email", email);
                            nick = account.optString("nickname", "");
                            credits = account.optInt("credits", 0);
                        }
                        long expire = 0L;
                        String expiresAt = data.optString("expiresAt", "");
                        if (!expiresAt.isEmpty()) {
                            try {
                                expire = java.text.SimpleDateFormat.getDateInstance().parse(expiresAt).getTime();
                            } catch (Exception ignored) {
                            }
                        }
                        SharedPreferences.Editor ed = prefs().edit();
                        ed.putString(KEY_TOKEN, token);
                        ed.putString(KEY_EMAIL, savedEmail);
                        ed.putInt(KEY_CREDITS, credits);
                        if (!nick.isEmpty()) ed.putString(KEY_NICKNAME, nick);
                        if (expire > 0) ed.putLong(KEY_EXPIRE, expire);
                        ed.apply();
                        Log.i(TAG, "Login success: email=" + savedEmail + " credits=" + credits);
                        postSuccess(callback, data);
                    } else {
                        String code = resp.optString("code", "unknown");
                        String msg = resp.optString("error", "登录失败");
                        Log.e(TAG, "Login failed: code=" + code + " msg=" + msg);
                        postError(callback, code, msg);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "login network error", e);
                    postError(callback, "network", e.getMessage() == null ? "网络连接失败" : e.getMessage());
                }
            }
        });
    }

    /**
     * 获取账号资料: action=getAccountProfile
     * 请求: {action, accountToken}
     * 响应: {ok:true, data:{account:{...}, costPerSuccess}}
     */
    public void getAccountProfile(final Callback callback) {
        final String token = getToken();
        if (token == null || token.isEmpty()) {
            postError(callback, "no_token", "未登录");
            return;
        }
        final JSONObject body = new JSONObject();
        try {
            body.put("action", "getAccountProfile");
            body.put("accountToken", token);
        } catch (Exception e) {
            postError(callback, "local", "构建请求失败");
            return;
        }
        runAsync(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject resp = postJson(API_ENDPOINT, body);
                    if (resp.optBoolean("ok")) {
                        Object d = resp.opt("data");
                        JSONObject data = d instanceof JSONObject ? (JSONObject) d : new JSONObject();
                        JSONObject account = data.optJSONObject("account");
                        if (account != null) {
                            String nick = account.optString("nickname", "");
                            int credits = account.optInt("credits", 0);
                            SharedPreferences.Editor ed = prefs().edit();
                            if (!nick.isEmpty()) ed.putString(KEY_NICKNAME, nick);
                            ed.putInt(KEY_CREDITS, credits);
                            ed.apply();
                        }
                        postSuccess(callback, data);
                    } else {
                        String code = resp.optString("code", "unknown");
                        postError(callback, code, resp.optString("error", "获取资料失败"));
                    }
                } catch (Exception e) {
                    Log.e(TAG, "profile error", e);
                    postError(callback, "network", e.getMessage());
                }
            }
        });
    }

    /** 退出登录: action=logoutAccount */
    public void logoutAccount(final Callback callback) {
        final String token = getToken();
        final JSONObject body = new JSONObject();
        try {
            body.put("action", "logoutAccount");
            if (token != null) body.put("accountToken", token);
        } catch (Exception ignored) {
        }
        runAsync(new Runnable() {
            @Override
            public void run() {
                try {
                    if (token != null) {
                        postJson(API_ENDPOINT, body);
                    }
                } catch (Exception ignored) {
                } finally {
                    clear();
                    postSuccess(callback, new JSONObject());
                }
            }
        });
    }

    /**
     * 通用 POST 请求（供 OverlayService 调用 analyze 等接口）
     */
    public JSONObject postAction(String action, JSONObject params) throws Exception {
        JSONObject body = new JSONObject();
        body.put("action", action);
        if (params != null) {
            for (java.util.Iterator<String> it = params.keys(); it.hasNext(); ) {
                String key = it.next();
                body.put(key, params.opt(key));
            }
        }
        return postJson(API_ENDPOINT, body);
    }

    private void runAsync(Runnable r) {
        new Thread(r).start();
    }

    private void postSuccess(final Callback cb, final JSONObject data) {
        if (cb == null) return;
        context.getMainExecutor().execute(new Runnable() {
            @Override
            public void run() { cb.onSuccess(data); }
        });
    }

    private void postError(final Callback cb, final String code, final String msg) {
        if (cb == null) return;
        context.getMainExecutor().execute(new Runnable() {
            @Override
            public void run() { cb.onError(code, msg); }
        });
    }

    JSONObject postJson(String urlStr, JSONObject body) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("X-Client-Version", APP_VERSION);
            conn.setRequestProperty("X-Client-Platform", PLATFORM);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            conn.setDoOutput(true);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(payload);
            os.flush();
            os.close();
            int code = conn.getResponseCode();
            InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
            String respText = readStream(is);
            if (respText == null || respText.isEmpty()) respText = "{}";
            return new JSONObject(respText);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String readStream(InputStream is) throws Exception {
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append('\n');
        }
        reader.close();
        return sb.toString().trim();
    }
}
