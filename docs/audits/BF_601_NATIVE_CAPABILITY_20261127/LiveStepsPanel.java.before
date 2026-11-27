package ru.bodyforge.healthqa;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.StepsRecord;
import android.os.OutcomeReceiver;
import android.os.SystemClock;
import android.view.View;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Native-only foreground presentation. No values are passed to WebView. */
final class LiveStepsPanel extends LinearLayout {
    private static final int ACCENT = 0xff63e3d8;
    private static final int MUTED = 0xffb8c7d5;
    private final Activity activity;
    private final TextView today, live, todayStatus, liveStatus;
    private final LinearLayout metrics, todayColumn, liveColumn;
    private final ImageButton settings;
    private boolean stacked;
    private final SensorManager sensors;
    private final Sensor detector;
    private final LiveStepPolicy.Refresh refresh = new LiveStepPolicy.Refresh();
    private LiveStepPolicy.Session session;
    private SensorEventListener listener;
    private boolean attemptedSensor, enabled, healthGranted;
    private StepsPolicy.DayWindow queryWindow, displayedWindow;

    LiveStepsPanel(Activity activity, Runnable configure) {
        super(activity);
        this.activity = activity;
        setOrientation(VERTICAL);
        setPadding(dp(12), dp(6), dp(12), dp(6));
        setBackgroundColor(0xff0a1018);

        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(HORIZONTAL);
        card.setGravity(android.view.Gravity.CENTER_VERTICAL);
        card.setPadding(dp(12), dp(9), dp(8), dp(9));
        card.setBackground(surface(0xff161e29, 0xff364454, 16));
        addView(card, new LinearLayout.LayoutParams(-1, -2));

        metrics = new LinearLayout(activity);
        metrics.setOrientation(HORIZONTAL);
        todayColumn = new LinearLayout(activity);
        todayColumn.setOrientation(VERTICAL);
        liveColumn = new LinearLayout(activity);
        liveColumn.setOrientation(VERTICAL);
        label(todayColumn, "Шаги сегодня", 12, MUTED);
        today = number(todayColumn, ACCENT);
        todayStatus = label(todayColumn, "Health Connect", 11, MUTED);
        label(liveColumn, "За сеанс", 12, MUTED);
        live = number(liveColumn, 0xfff2f5fa);
        liveStatus = label(liveColumn, "Датчик телефона", 11, MUTED);
        metrics.addView(todayColumn, new LinearLayout.LayoutParams(0, -2, 1f));
        metrics.addView(liveColumn, new LinearLayout.LayoutParams(0, -2, 1f));
        liveColumn.setPadding(dp(10), 0, 0, 0);
        card.addView(metrics, new LinearLayout.LayoutParams(0, -2, 1f));

        settings = new ImageButton(activity);
        settings.setImageResource(android.R.drawable.ic_menu_preferences);
        settings.setImageTintList(ColorStateList.valueOf(ACCENT));
        settings.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        settings.setPadding(dp(12), dp(12), dp(12), dp(12));
        settings.setMinimumWidth(dp(48));
        settings.setMinimumHeight(dp(48));
        settings.setBackground(new RippleDrawable(ColorStateList.valueOf(0x3363e3d8),
            surface(0xff202a37, 0xff364454, 12), null));
        settings.setContentDescription("Настроить источники шагов");
        settings.setTooltipText("Источники шагов");
        settings.setOnClickListener(v -> { if (enabled && settings.isEnabled()) configure.run(); });
        LinearLayout.LayoutParams settingsSize = new LinearLayout.LayoutParams(dp(48), dp(48));
        settingsSize.setMarginStart(dp(8));
        card.addView(settings, settingsSize);
        sensors = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        detector = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        setVisibility(View.GONE);
    }

    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private TextView label(LinearLayout parent, String text, int size, int color) {
        TextView v = new TextView(activity);
        v.setText(text); v.setTextSize(size); v.setTextColor(color);
        v.setSaveEnabled(false);
        parent.addView(v, new LinearLayout.LayoutParams(-1,-2));
        return v;
    }
    private GradientDrawable surface(int color, int stroke, int radius) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(color);
        result.setCornerRadius(dp(radius));
        result.setStroke(dp(1), stroke);
        return result;
    }

    private TextView number(LinearLayout parent, int color) {
        TextView value = label(parent, "—", 23, color);
        value.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        value.setFontFeatureSettings("tnum");
        return value;
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        // Stack on very narrow displays or with large system text instead of clipping.
        float density = getResources().getDisplayMetrics().density;
        float fontScale = Math.max(1f, getResources().getConfiguration().fontScale);
        boolean narrow = View.MeasureSpec.getMode(widthSpec) != View.MeasureSpec.UNSPECIFIED
            && View.MeasureSpec.getSize(widthSpec) / density / fontScale < 310f;
        if (stacked != narrow) {
            stacked = narrow;
            metrics.setOrientation(narrow ? VERTICAL : HORIZONTAL);
            todayColumn.setLayoutParams(new LinearLayout.LayoutParams(narrow ? -1 : 0, -2, narrow ? 0f : 1f));
            liveColumn.setLayoutParams(new LinearLayout.LayoutParams(narrow ? -1 : 0, -2, narrow ? 0f : 1f));
            liveColumn.setPadding(narrow ? 0 : dp(10), narrow ? dp(8) : 0, 0, 0);
        }
        super.onMeasure(widthSpec, heightSpec);
    }

    private void showToday(String value, String source) {
        today.setText(value);
        todayStatus.setText(source);
    }

    private void showLive(String value, String source) {
        live.setText(value);
        liveStatus.setText(source);
    }

    private boolean granted(String permission) {
        return activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }
    private String format(long value) {
        return NumberFormat.getIntegerInstance(new Locale("ru","RU")).format(value);
    }

    void updateScreen(LiveStepPolicy.Screen screen) {
        if (screen == LiveStepPolicy.Screen.OFF) { stop(); return; }
        if (!enabled) {
            enabled = true;
            setVisibility(View.VISIBLE);
        }
        settings.setEnabled(screen == LiveStepPolicy.Screen.READY);
        settings.setAlpha(settings.isEnabled() ? 1f : .65f);
        tick();
    }

    void stop() {
        if (!enabled) return;
        enabled = false;
        stopSensor();
        attemptedSensor = false;
        healthGranted = false;
        refresh.reset();
        queryWindow = displayedWindow = null;
        showToday("—", "Health Connect");
        showLive("—", "Датчик телефона");
        setVisibility(View.GONE);
    }

    private void stopSensor() {
        SensorEventListener previous = listener;
        listener = null;
        session = null;
        if (previous != null && sensors != null) sensors.unregisterListener(previous);
    }

    private void tickSensor() {
        if (detector == null) {
            showLive("—", "Нет датчика");
            return;
        }
        if (!granted(Manifest.permission.ACTIVITY_RECOGNITION)) {
            stopSensor();
            attemptedSensor = false;
            showLive("—", "Нужен доступ");
            return;
        }
        if (listener != null || attemptedSensor) return;
        attemptedSensor = true;
        final LiveStepPolicy.Session candidate = new LiveStepPolicy.Session(SystemClock.elapsedRealtimeNanos());
        final SensorEventListener newListener = new SensorEventListener() {
            @Override public void onSensorChanged(SensorEvent event) {
                if (!enabled || listener != this || session != candidate ||
                    !granted(Manifest.permission.ACTIVITY_RECOGNITION)) return;
                if (event.sensor == detector && event.values.length > 0 &&
                    candidate.accept(event.timestamp, SystemClock.elapsedRealtimeNanos(), event.values[0])) {
                    showLive(format(candidate.count()), "Датчик телефона");
                }
            }
            @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        listener = newListener;
        session = candidate;
        try {
            if (sensors.registerListener(newListener, detector, SensorManager.SENSOR_DELAY_NORMAL, 0)) {
                showLive("0", "Датчик телефона");
                return;
            }
        } catch (RuntimeException ignored) { }
        stopSensor();
        showLive("—", "Нет датчика");
    }

    private void tick() {
        tickSensor();
        if (!HealthStepsActivity.available(activity) || !granted(HealthStepsActivity.READ_STEPS)) {
            if (healthGranted) refresh.reset();
            healthGranted = false;
            queryWindow = displayedWindow = null;
            showToday("—", "Нет доступа к HC");
            return;
        }
        if (!healthGranted) { healthGranted = true; refresh.reset(); }
        final Instant now = Instant.now();
        final ZoneId zone = ZoneId.systemDefault();
        if ((queryWindow != null && !queryWindow.isCurrent(now, zone)) ||
            (displayedWindow != null && !displayedWindow.isCurrent(now, zone))) {
            refresh.reset();
            queryWindow = displayedWindow = null;
            showToday("—", "Новая дата");
        }
        final long elapsed = SystemClock.elapsedRealtime();
        if (refresh.expired(elapsed)) {
            refresh.finish();
            queryWindow = displayedWindow = null;
            showToday("—", "Нет ответа HC");
        }
        if (!refresh.due(elapsed)) return;
        final StepsPolicy.DayWindow window = new StepsPolicy.DayWindow(now, zone);
        if (!window.valid()) { showToday("—", "Новый день"); return; }
        final int ticket = refresh.begin(elapsed);
        queryWindow = window;
        if (displayedWindow == null) showToday("—", "Обновление…");
        try {
            HealthConnectManager manager = activity.getSystemService(HealthConnectManager.class);
            if (manager == null) { complete(ticket, window, null, "источник недоступен"); return; }
            TimeInstantRangeFilter filter = new TimeInstantRangeFilter.Builder()
                .setStartTime(window.start).setEndTime(window.end).build();
            AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(filter)
                .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build();
            manager.aggregate(request, activity.getMainExecutor(),
                new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                    @Override public void onResult(AggregateRecordsResponse<Long> response) {
                        if (!enabled || !refresh.current(ticket)) return;
                        try {
                            Long value = response == null ? null : response.get(StepsRecord.STEPS_COUNT_TOTAL);
                            complete(ticket, window, value, "нет данных");
                        } catch (RuntimeException error) {
                            complete(ticket, window, null, "ошибка источника");
                        }
                    }
                    @Override public void onError(HealthConnectException error) {
                        complete(ticket, window, null, "ошибка источника");
                    }
                });
        } catch (RuntimeException | LinkageError error) {
            complete(ticket, window, null, "источник недоступен");
        }
    }

    private void complete(int ticket, StepsPolicy.DayWindow window, Long value, String unavailable) {
        if (!enabled || !refresh.current(ticket)) return;
        if (refresh.expired(SystemClock.elapsedRealtime())) {
            refresh.finish();
            queryWindow = displayedWindow = null;
            showToday("—", "Нет ответа HC");
            return;
        }
        refresh.finish();
        queryWindow = null;
        if (!granted(HealthStepsActivity.READ_STEPS) ||
            !window.isCurrent(Instant.now(), ZoneId.systemDefault())) {
            displayedWindow = null;
            showToday("—", "Дата / доступ изменились");
            return;
        }
        if (StepsPolicy.validCount(value)) {
            displayedWindow = window;
            String time = DateTimeFormatter.ofPattern("HH:mm").withZone(window.zone).format(window.end);
            showToday(format(value), "HC · " + time);
        } else {
            displayedWindow = null;
            showToday("—", unavailable);
        }
    }
}
