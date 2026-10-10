package com.yildizkumlama.alacak;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
    }

    /** Web sayfasından çağrılır: belge yazdırma / PDF kaydetme ve dosya indirme. */
    public class AndroidBridge {

        @JavascriptInterface
        public void print(final String title) {
            runOnUiThread(() -> {
                WebView wv = getBridge().getWebView();
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                String name = (title == null || title.isEmpty()) ? "Belge" : title;
                PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
                pm.print(name, wv.createPrintDocumentAdapter(name), attrs);
            });
        }

        @JavascriptInterface
        public boolean saveFile(final String filename, String base64, String mime) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(data);
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    dir.mkdirs();
                    try (FileOutputStream os = new FileOutputStream(new File(dir, filename))) {
                        os.write(data);
                    }
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "İndirilenler klasörüne kaydedildi: " + filename, Toast.LENGTH_LONG).show());
                return true;
            } catch (Exception e) {
                final String msg = e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "Kaydedilemedi: " + msg, Toast.LENGTH_LONG).show());
                return false;
            }
        }
    }
}
