package io.ldelg.smartofflinenotes;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Android 16 draws the app edge to edge and no longer delivers KEYCODE_BACK.
 * Capacitor insets the WebView for the status and navigation bars. Back uses
 * the predictive-back dispatcher: dismiss an open overlay, go back in the
 * WebView, or finish so the system can play the back-to-home animation.
 */
public class MainActivity extends BridgeActivity {

    private static final int BAR_COLOR = Color.parseColor("#0d0d0d");

    private static final String DISMISS_OVERLAY_JS =
        "(function(){var nodes=document.querySelectorAll('ion-alert,ion-action-sheet,ion-modal,ion-popover,ion-loading,ion-picker');"
            + "var open=nodes.length?nodes[nodes.length-1]:null;"
            + "if(open&&typeof open.dismiss==='function'){open.dismiss();return 'overlay';}"
            + "if(document.querySelector('.translate-picker')){document.dispatchEvent(new CustomEvent('smartnotes-dismiss-translate'));return 'overlay';}"
            + "return '';})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        DocumentIntentPlugin.freshLaunch = savedInstanceState == null;
        registerPlugin(DocumentIntentPlugin.class);
        super.onCreate(savedInstanceState);
        applySystemBarStyle();
        registerPredictiveBack();
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarStyle() {
        if (getWindow() == null) {
            return;
        }
        getWindow().setStatusBarColor(BAR_COLOR);
        getWindow().setNavigationBarColor(BAR_COLOR);
        getWindow().getDecorView().setBackgroundColor(BAR_COLOR);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }
    }

    private void registerPredictiveBack() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = getBridge().getWebView();
                        if (webView == null) {
                            finishAfterBack(this);
                            return;
                        }
                        webView.evaluateJavascript(DISMISS_OVERLAY_JS, value -> {
                            if ("\"overlay\"".equals(value)) {
                                return;
                            }
                            if (webView.canGoBack()) {
                                webView.goBack();
                                return;
                            }
                            finishAfterBack(this);
                        });
                    }
                }
            );
    }

    private void finishAfterBack(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
    }
}
