package ru.bodyforge.healthqa;

import android.Manifest;
import android.app.Activity;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.StepsRecord;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.OutcomeReceiver;
import android.os.ext.SdkExtensions;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Foreground, read-only, native screen. No step data enters WebView or storage. */
public final class HealthStepsActivity extends Activity {
    static final String READ_STEPS = "android.permission.health.READ_STEPS";
    static final String PRIVACY = "BODYFORGE читает только сумму шагов за текущий местный день "
        + "из Health Connect после твоего разрешения. Число показывается в приложении, "
        + "не сохраняется в игре, не передаётся на сервер и не даёт XP или монет. "
        + "Фоновое чтение и запись данных не используются. "
        + "Доступ можно отозвать в настройках Health Connect. "
        + "Отдельное разрешение «Физическая активность» включает датчик шагов только на открытом экране Камера. "
        + "Шаги сеанса не складываются с дневной суммой, не сохраняются и не отправляются. "
        + "Это разрешение можно отозвать в настройках приложения.";
    private static final int PERMISSION_REQUEST = 3101;
    private static final int LIVE_PERMISSION_REQUEST = 3102;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView status, count, updated;
    private Button refresh, livePermission;
    private TextView liveStatus, systemStepsStatus;
    private boolean resumed, permissionPending, readOnResume;
    private int generation;
    private Runnable timeout;
    private StepsPolicy.DayWindow queryWindow, displayedWindow;
    // A visible total must never silently become yesterday's value. This timer
    // checks service availability, permission and the clock; it does not read step records.
    private final Runnable validityWatcher = new Runnable() {
        @Override public void run() {
            if (!resumed || isFinishing() || isDestroyed()) return;
            StepsPolicy.DayWindow activeWindow = queryWindow != null ? queryWindow : displayedWindow;
            if (activeWindow != null && !StepsPolicy.canDisplayDaily(
                dailyAccess(HealthStepsActivity.this), activeWindow, Instant.now(), ZoneId.systemDefault())) {
                invalidateRead();
                showIdle();
                status.setText("Дата или доступ изменились. Обнови шаги.");
            }
            handler.postDelayed(this, 3000);
        }
    };

    static boolean available(Context context) {
        if (Build.VERSION.SDK_INT < 34) return false;
        try { return context.getSystemService(HealthConnectManager.class) != null; }
        catch (RuntimeException | LinkageError e) { return false; }
    }
    static StepsPolicy.DailyAccess dailyAccess(Context context) {
        boolean supported = available(context);
        return StepsPolicy.dailyAccess(supported,
            supported && context.checkSelfPermission(READ_STEPS) == PackageManager.PERMISSION_GRANTED);
    }

    private static StepsPolicy.SystemSteps systemStepsSupport(boolean supported) {
        Integer extension = null;
        if (supported && Build.VERSION.SDK_INT >= 34) {
            try { extension = SdkExtensions.getExtensionVersion(Build.VERSION_CODES.UPSIDE_DOWN_CAKE); }
            catch (RuntimeException | LinkageError ignored) { }
        }
        return StepsPolicy.systemSteps(Build.VERSION.SDK_INT, extension, supported);
    }

    private void updateSystemStepsStatus(boolean supported) {
        switch (systemStepsSupport(supported)) {
            case SUPPORTED:
                systemStepsStatus.setText("Система поддерживает встроенный подсчёт Health Connect. Наличие шагов зависит от датчика, настроек и разрешения.");
                break;
            case REQUIRES_EXTENSION:
                systemStepsStatus.setText("Для встроенного подсчёта Health Connect нужно расширение SDK 20 или выше. При наличии разрешения можно читать сумму из других источников.");
                break;
            case UNKNOWN:
                systemStepsStatus.setText("Поддержка встроенного подсчёта Health Connect не определена. Дневная сумма может включать данные других источников.");
                break;
            default:
                systemStepsStatus.setText("Health Connect недоступен.");
        }
    }

    private boolean granted() {
        return checkSelfPermission(READ_STEPS) == PackageManager.PERMISSION_GRANTED;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(LinearLayout root, String value, int size, int color) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(size);
        v.setTextColor(color);
        v.setPadding(0, dp(8), 0, dp(8));
        root.addView(v, new LinearLayout.LayoutParams(-1, -2));
        return v;
    }
    private Button button(LinearLayout root, String label, Runnable action) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setMinHeight(dp(48));
        b.setOnClickListener(v -> action.run());
        root.addView(b, new LinearLayout.LayoutParams(-1, -2));
        return b;
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(Color.rgb(10,16,24));
        getWindow().setNavigationBarColor(Color.rgb(10,16,24));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(22), dp(22), dp(22));
        root.setBackgroundColor(Color.rgb(16,25,35));
        scroll.addView(root);
        text(root, "ШАГИ / HEALTH CONNECT", 20, 0xff63e3d8);
        text(root, "Сегодня", 16, 0xffaab9c8);
        count = text(root, "—", 42, 0xffeaf4fb);
        status = text(root, "", 16, 0xffeaf4fb);
        status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        updated = text(root, "", 13, 0xffaab9c8);
        systemStepsStatus = text(root, "", 13, 0xffaab9c8);
        refresh = button(root, "Синхронизировать", this::requestOrRead);
        button(root, "Настройки Health Connect", this::openSettings);
        text(root, "Живой счётчик · шаги за открытый сеанс Камеры", 16, 0xff63e3d8);
        liveStatus = text(root, "", 14, 0xffaab9c8);
        livePermission = button(root, "Разрешить физическую активность", this::requestLivePermission);
        button(root, "Разрешения приложения", this::openAppSettings);
        updateLivePermission();
        text(root, PRIVACY, 13, 0xffaab9c8);
        button(root, "Вернуться в BODYFORGE", this::finish);
        setContentView(scroll);
        // The user explicitly opened this native screen. Permission still
        // requires a separate native button tap when not already granted.
        readOnResume = available(this) && granted();
        showIdle();
    }

    private void invalidateRead() {
        generation++;
        if (timeout != null) handler.removeCallbacks(timeout);
        timeout = null;
        queryWindow = displayedWindow = null;
        count.setText("—");
        updated.setText("");
    }
    private void showIdle() {
        StepsPolicy.DailyAccess access = dailyAccess(this);
        boolean supported = access != StepsPolicy.DailyAccess.UNAVAILABLE;
        boolean permitted = access == StepsPolicy.DailyAccess.READY;
        updateSystemStepsStatus(supported);
        refresh.setEnabled(supported && !permissionPending);
        refresh.setText(permitted ? "Обновить шаги" : "Разрешить чтение шагов");
        status.setText(!supported ? "Health Connect недоступен на этом устройстве."
            : permitted ? "Нажми «Обновить шаги»." : "Доступ к шагам не предоставлен.");
    }
    private boolean hasDetector() {
        try {
            SensorManager manager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
            return manager != null && manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null;
        } catch (RuntimeException error) { return false; }
    }
    private boolean liveGranted() {
        return checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }
    private void updateLivePermission() {
        if (liveStatus == null) return;
        boolean supported = hasDetector();
        liveStatus.setText(!supported ? "На устройстве нет системного датчика шагов."
            : liveGranted() ? "Доступ есть. Вернись на Камеру: сеанс начнётся с нуля."
            : "Для событий каждого шага нужно отдельное разрешение.");
        livePermission.setEnabled(supported && !liveGranted() && !permissionPending);
    }
    private void requestLivePermission() {
        if (!resumed || permissionPending || !hasDetector() || liveGranted()) return;
        permissionPending = true;
        livePermission.setEnabled(false);
        refresh.setEnabled(false);
        try { requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, LIVE_PERMISSION_REQUEST); }
        catch (RuntimeException error) {
            permissionPending = false;
            showIdle();
            updateLivePermission();
            liveStatus.setText("Не удалось открыть разрешение. Проверь настройки приложения.");
        }
    }
    private void openAppSettings() {
        try {
            startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:" + getPackageName())));
        } catch (RuntimeException error) {
            liveStatus.setText("Открой разрешения BODYFORGE в настройках Android.");
        }
    }
    private void requestOrRead() {
        if (!resumed || permissionPending) return;
        StepsPolicy.DailyAccess access = dailyAccess(this);
        if (access == StepsPolicy.DailyAccess.READY) { readToday(); return; }
        invalidateRead();
        if (access == StepsPolicy.DailyAccess.UNAVAILABLE) { showIdle(); return; }
        permissionPending = true;
        refresh.setEnabled(false);
        try {
            requestPermissions(new String[]{READ_STEPS}, PERMISSION_REQUEST);
        } catch (RuntimeException e) {
            permissionPending = false;
            showIdle();
            status.setText("Не удалось открыть системное разрешение. Проверь Health Connect.");
        }
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == LIVE_PERMISSION_REQUEST) {
            permissionPending = false;
            updateLivePermission();
            showIdle();
            return;
        }
        if (code != PERMISSION_REQUEST) return;
        permissionPending = false;
        updateLivePermission();
        invalidateRead();
        readOnResume = granted();
        if (resumed) {
            if (readOnResume) { readOnResume = false; readToday(); }
            else showIdle();
        }
    }
    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        updateLivePermission();
        handler.removeCallbacks(validityWatcher);
        handler.post(validityWatcher);
        if (!permissionPending && readOnResume) {
            readOnResume = false;
            if (granted()) { readToday(); return; }
        }
        showIdle();
    }
    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(validityWatcher);
        invalidateRead();
        status.setText("");
        super.onPause();
    }
    @Override protected void onDestroy() {
        resumed = false;
        invalidateRead();
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
    private void openSettings() {
        try { startActivity(new Intent("android.health.connect.action.HEALTH_HOME_SETTINGS")); }
        catch (RuntimeException e) { status.setText("Открой Health Connect в системных настройках."); }
    }
    private boolean active(int ticket) {
        return resumed && !isFinishing() && !isDestroyed() && generation == ticket;
    }
    private void complete(int ticket, String message, Long value, StepsPolicy.DayWindow window) {
        if (!active(ticket)) return;
        invalidateRead();
        showIdle();
        StepsPolicy.DailyAccess access = dailyAccess(this);
        if (access == StepsPolicy.DailyAccess.UNAVAILABLE) {
            status.setText("Health Connect недоступен.");
            return;
        }
        if (access != StepsPolicy.DailyAccess.READY) {
            status.setText("Доступ отозван. Число шагов скрыто.");
            return;
        }
        if (!StepsPolicy.canDisplayDaily(access, window, Instant.now(), ZoneId.systemDefault())) {
            status.setText("Дата, время или часовой пояс изменились. Обнови шаги.");
            return;
        }
        status.setText(message);
        if (StepsPolicy.validCount(value)) {
            displayedWindow = window;
            count.setText(NumberFormat.getIntegerInstance(new Locale("ru","RU")).format(value));
            updated.setText("Health Connect · " + DateTimeFormatter.ofPattern("dd.MM HH:mm")
                .withZone(window.zone).format(window.end));
        }
    }
    private void readToday() {
        if (!resumed) return;
        invalidateRead();
        if (dailyAccess(this) != StepsPolicy.DailyAccess.READY) { showIdle(); return; }
        StepsPolicy.DayWindow window = new StepsPolicy.DayWindow(Instant.now(), ZoneId.systemDefault());
        if (!window.valid()) { showIdle(); status.setText("Сегодняшний интервал ещё пуст."); return; }
        final int ticket = generation;
        queryWindow = window;
        refresh.setEnabled(false);
        status.setText("Получаю шаги из Health Connect…");
        timeout = () -> complete(ticket, "Источник не ответил. Попробуй ещё раз.", null, window);
        handler.postDelayed(timeout, 15000);
        try {
            HealthConnectManager manager = getSystemService(HealthConnectManager.class);
            if (manager == null) { complete(ticket, "Источник недоступен.", null, window); return; }
            TimeInstantRangeFilter filter = new TimeInstantRangeFilter.Builder()
                .setStartTime(window.start).setEndTime(window.end).build();
            AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(filter)
                .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build();
            manager.aggregate(request, getMainExecutor(),
                new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                    @Override public void onResult(AggregateRecordsResponse<Long> response) {
                        if (!active(ticket)) return;
                        try {
                            Long value = response == null ? null : response.get(StepsRecord.STEPS_COUNT_TOTAL);
                            complete(ticket, StepsPolicy.validCount(value)
                                ? "Шагов за сегодня" : "За сегодня пока нет данных Health Connect.",
                                StepsPolicy.validCount(value) ? value : null, window);
                        } catch (RuntimeException error) {
                            complete(ticket, "Ответ Health Connect недоступен. Попробуй ещё раз.", null, window);
                        }
                    }
                    @Override public void onError(HealthConnectException error) {
                        complete(ticket, "Health Connect не смог прочитать шаги. Проверь доступ и обновление системы.",
                            null, window);
                    }
                });
        } catch (RuntimeException | LinkageError e) {
            complete(ticket, "Чтение недоступно. Проверь разрешение и Health Connect.", null, window);
        }
    }
}
