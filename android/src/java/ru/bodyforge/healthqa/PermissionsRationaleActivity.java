package ru.bodyforge.healthqa;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowManager;

/** Same privacy explanation reachable from Android's permission screen. */
public final class PermissionsRationaleActivity extends Activity {
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        new AlertDialog.Builder(this)
            .setTitle("BODYFORGE — доступ к шагам")
            .setMessage(HealthStepsActivity.PRIVACY)
            .setPositiveButton("Закрыть", (dialog, which) -> finish())
            .setOnCancelListener(dialog -> finish())
            .show();
    }
}
