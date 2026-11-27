package ru.bodyforge.healthqa;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int CAMERA_REQ = 2101;
    private static final int FILE_REQ = 2102;
    private WebView view;
    private LiveStepsPanel liveSteps;
    private final Handler screenHandler = new Handler(Looper.getMainLooper());
    private boolean foreground, probing;
    private int screenEpoch, settingsEpoch;
    private long probeStarted, settingsStarted;
    private boolean settingsPending;
    private static final String SCREEN_PROBE =
        "(function(){var a=document.querySelector('.app-shell'),s=document.querySelector('[data-native-live-panel]');"
        + "if(location.origin!=='https://appassets.androidplatform.net'||document.visibilityState!=='visible'"
        + "||!a||a.dataset.screen!=='challenge'||!s)return 'off';"
        + "return s.dataset.nativeLivePanel==='ready'?'ready':s.dataset.nativeLivePanel==='busy'?'busy':'off';})()";
    private final Runnable screenPoll = new Runnable() {
        @Override public void run() {
            if (!foreground || liveSteps == null || view == null) return;
            if (settingsPending && SystemClock.elapsedRealtime()-settingsStarted >= 3000L) {
                settingsPending = false;
                settingsEpoch++;
            }
            if (probing && SystemClock.elapsedRealtime()-probeStarted >= 3000L) {
                invalidateScreen();
            }
            if (!probing) {
                if (!isPackagedPage()) invalidateScreen();
                else {
                    probing = true;
                    probeStarted = SystemClock.elapsedRealtime();
                    final int ticket = ++screenEpoch;
                    try {
                        view.evaluateJavascript(SCREEN_PROBE, result -> {
                            if (!foreground || ticket != screenEpoch || view == null) return;
                            probing = false;
                            if (!isPackagedPage()) { invalidateScreen(); return; }
                            applyScreen(LiveStepPolicy.screen(result));
                        });
                    } catch (RuntimeException error) { invalidateScreen(); }
                }
            }
            screenHandler.postDelayed(this, 800L);
        }
    };

    private boolean isPackagedPage() {
        if (view == null || view.getUrl() == null) return false;
        Uri url = Uri.parse(view.getUrl());
        return trusted(url) && ("/".equals(url.getPath()) || "/index.html".equals(url.getPath()))
            && url.getEncodedQuery() == null;
    }

    private void applyScreen(LiveStepPolicy.Screen screen) {
        if (liveSteps == null) return;
        if (screen == LiveStepPolicy.Screen.OFF) {
            settingsPending = false;
            settingsEpoch++;
            liveSteps.stop();
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            liveSteps.updateScreen(screen);
        }
    }

    private void invalidateScreen() {
        screenEpoch++;
        probing = false;
        applyScreen(LiveStepPolicy.Screen.OFF);
    }

    private void openLiveSettings() {
        if (!foreground || !isPackagedPage() || settingsPending) return;
        settingsPending = true;
        settingsStarted = SystemClock.elapsedRealtime();
        final int ticket = ++settingsEpoch;
        try {
            view.evaluateJavascript(SCREEN_PROBE, result -> {
                if (!settingsPending || ticket != settingsEpoch) return;
                settingsPending = false;
                if (foreground && isPackagedPage() &&
                    SystemClock.elapsedRealtime()-settingsStarted < 3000L &&
                    LiveStepPolicy.screen(result) == LiveStepPolicy.Screen.READY) {
                    invalidateScreen();
                    startActivity(new Intent(MainActivity.this, HealthStepsActivity.class));
                }
            });
        } catch (RuntimeException error) { invalidateScreen(); }
    }
    private PermissionRequest pendingCamera;
    private android.webkit.ValueCallback<Uri[]> pendingFiles;

    private static boolean trusted(Uri url) {
        return url != null && "https".equalsIgnoreCase(url.getScheme())
            && HOST.equals(url.getEncodedAuthority());
    }

    private static String mime(String p) {
        String s = p.toLowerCase(Locale.ROOT);
        if (s.endsWith(".html")) return "text/html";
        if (s.endsWith(".js") || s.endsWith(".mjs")) return "text/javascript";
        if (s.endsWith(".css")) return "text/css";
        if (s.endsWith(".json") || s.endsWith(".webmanifest")) return "application/json";
        if (s.endsWith(".wasm")) return "application/wasm";
        if (s.endsWith(".glb")) return "model/gltf-binary";
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
        if (s.endsWith(".webp")) return "image/webp";
        if (s.endsWith(".svg")) return "image/svg+xml";
        if (s.endsWith(".woff2")) return "font/woff2";
        if (s.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
            Collections.singletonMap("Cache-Control", "no-store"),
            new ByteArrayInputStream("Not Found".getBytes(StandardCharsets.UTF_8)));
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(10, 16, 24));
        getWindow().setNavigationBarColor(Color.rgb(10, 16, 24));
        view = new WebView(this);
        view.setBackgroundColor(Color.rgb(10, 16, 24));
        WebSettings config = view.getSettings();
        config.setJavaScriptEnabled(true);
        config.setDomStorageEnabled(true);
        config.setDatabaseEnabled(true);
        config.setAllowFileAccess(false);
        config.setAllowContentAccess(false);
        config.setAllowFileAccessFromFileURLs(false);
        config.setAllowUniversalAccessFromFileURLs(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        config.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);
        if (android.os.Build.VERSION.SDK_INT >= 34 && HealthStepsActivity.available(this)) {
            // Older link remains usable if native panel construction is unavailable.
            String agent = config.getUserAgentString() + " " + StepsPolicy.USER_AGENT_TOKEN;
            try { liveSteps = new LiveStepsPanel(this, this::openLiveSettings); }
            catch (RuntimeException | LinkageError error) { liveSteps = null; }
            config.setUserAgentString(agent + (liveSteps == null ? "" : " " + LiveStepPolicy.TOKEN));
        }
        view.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView browser, String url, android.graphics.Bitmap icon) {
                invalidateScreen();
                super.onPageStarted(browser, url, icon);
            }
            @Override public WebResourceResponse shouldInterceptRequest(
                WebView browser, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!trusted(uri)) return null;
                if (StepsPolicy.isReservedPath(uri.toString())) return notFound();
                String path = uri.getPath();
                if (path == null || "/".equals(path)) path = "/index.html";
                if (!path.startsWith("/") || path.contains("..") || path.contains("\\")
                    || path.indexOf((char) 0) >= 0) return notFound();
                try {
                    InputStream stream = getAssets().open("web" + path);
                    String type = mime(path);
                    boolean text = type.startsWith("text/") || type.contains("javascript")
                        || type.contains("json");
                    return new WebResourceResponse(type, text ? "UTF-8" : null, stream);
                } catch (IOException exception) {
                    return notFound();
                }
            }

            @Override public boolean shouldOverrideUrlLoading(WebView browser,
                WebResourceRequest request) {
                Uri target = request.getUrl();
                if (StepsPolicy.isReservedPath(target.toString())) {
                    if (android.os.Build.VERSION.SDK_INT >= 34
                        && HealthStepsActivity.available(MainActivity.this)
                        && StepsPolicy.allowsOpen(browser.getUrl(), target.toString(),
                            request.isForMainFrame(), request.hasGesture(), request.isRedirect(), request.getMethod())) {
                        startActivity(new Intent(MainActivity.this, HealthStepsActivity.class));
                    }
                    return true;
                }
                if (!request.isForMainFrame()) return !trusted(target);
                if (trusted(target)) return false;
                if (!request.hasGesture() || request.isRedirect()) return true;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception ignored) { }
                }
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    if (!trusted(req.getOrigin()) || req.getResources().length != 1
                        || !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(req.getResources()[0])) {
                        req.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                        req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        if (pendingCamera != null) pendingCamera.deny();
                        pendingCamera = req;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQ);
                    }
                });
            }

            @Override public void onPermissionRequestCanceled(PermissionRequest req) {
                if (pendingCamera == req) pendingCamera = null;
            }

            @Override public boolean onShowFileChooser(WebView browser,
                android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQ);
                    return true;
                } catch (Exception exception) {
                    pendingFiles = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        if (liveSteps != null) root.addView(liveSteps, new LinearLayout.LayoutParams(-1, -2));
        root.addView(view, new LinearLayout.LayoutParams(-1, 0, 1f));
        setContentView(root);
        view.loadUrl("https://" + HOST + "/");
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code != CAMERA_REQ || pendingCamera == null) return;
        PermissionRequest req = pendingCamera;
        pendingCamera = null;
        if (grants.length == 1 && grants[0] == PackageManager.PERMISSION_GRANTED) {
            req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            req.deny();
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_REQ && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFiles = null;
        }
    }

    @Override protected void onPause() {
        foreground = false;
        screenHandler.removeCallbacks(screenPoll);
        invalidateScreen();
        if (view != null) view.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (view != null) view.onResume();
        foreground = true;
        screenHandler.removeCallbacks(screenPoll);
        if (liveSteps != null) screenHandler.post(screenPoll);
    }
    @Override public void onBackPressed() {
        if (view != null && view.canGoBack()) view.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        foreground = false;
        screenHandler.removeCallbacksAndMessages(null);
        invalidateScreen();
        if (pendingCamera != null) pendingCamera.deny();
        if (pendingFiles != null) pendingFiles.onReceiveValue(null);
        if (view != null) { view.stopLoading(); view.destroy(); view = null; }
        super.onDestroy();
    }
}
