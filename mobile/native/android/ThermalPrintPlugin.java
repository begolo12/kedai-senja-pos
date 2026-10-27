package id.kedaisenja.pos;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ThermalPrint")
public class ThermalPrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html", "");
        String widthMm = call.getString("widthMm", "80");
        String jobName = call.getString("jobName", "Struk Kasir Senja");

        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            webView.getSettings().setJavaScriptEnabled(false);
            int widthPx = Math.max(200, Math.round(Float.parseFloat(widthMm) / 25.4f * 96f));
            getActivity().addContentView(
                webView,
                new ViewGroup.LayoutParams(widthPx, 1)
            );

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    try {
                        PrintManager manager =
                            (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        int widthMils = Math.round(Float.parseFloat(widthMm) / 25.4f * 1000f);
                        PrintAttributes attributes = new PrintAttributes.Builder()
                            .setMediaSize(
                                new PrintAttributes.MediaSize(
                                    "receipt",
                                    "Thermal Receipt",
                                    widthMils,
                                    11000
                                )
                            )
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                        manager.print(jobName, adapter, attributes);
                        JSObject result = new JSObject();
                        result.put("printed", true);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Gagal membuka dialog cetak", error);
                    }
                }
            });

            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
