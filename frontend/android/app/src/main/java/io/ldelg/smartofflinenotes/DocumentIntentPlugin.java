package io.ldelg.smartofflinenotes;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Reads ACTION_VIEW and ACTION_SEND documents into the WebView.
 * content:// streams are opened with the grant that came with the intent.
 * No storage permission is requested.
 */
@CapacitorPlugin(name = "DocumentIntent")
public class DocumentIntentPlugin extends Plugin {

    /** Set from MainActivity before the bridge is created. */
    static boolean freshLaunch = true;

    private static final int MAX_BYTES = 2 * 1024 * 1024;

    private JSObject pending;

    @Override
    public void load() {
        if (!freshLaunch) return;
        Activity activity = getActivity();
        if (activity == null) return;
        JSObject payload = readIntent(activity.getIntent());
        if (payload != null) pending = payload;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        Activity activity = getActivity();
        if (activity != null && intent != null) activity.setIntent(intent);
        JSObject payload = readIntent(intent);
        if (payload == null) return;
        pending = payload;
        notifyListeners("documents", payload);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        call.resolve(pending != null ? pending : emptyPayload());
    }

    @PluginMethod
    public void consume(PluginCall call) {
        String token = call.getString("token");
        if (pending != null && token != null && token.equals(pending.optString("token"))) {
            pending = null;
            Activity activity = getActivity();
            if (activity != null && token.equals(tokenFor(activity.getIntent()))) {
                Intent blank = new Intent(Intent.ACTION_MAIN);
                blank.addCategory(Intent.CATEGORY_LAUNCHER);
                activity.setIntent(blank);
            }
        }
        call.resolve();
    }

    private JSObject readIntent(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (action == null || Intent.ACTION_MAIN.equals(action)) return null;
        JSArray files = new JSArray();
        String text = null;
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String mime = intent.getType();
        if (Intent.ACTION_VIEW.equals(action)) {
            Uri uri = intent.getData();
            if (uri == null) uri = firstClipUri(intent);
            if (uri != null) files.put(readUri(uri, mime));
        } else if (Intent.ACTION_SEND.equals(action)) {
            List<Uri> uris = streamUris(intent, false);
            for (Uri uri : uris) files.put(readUri(uri, mime));
            if (files.length() == 0) text = textExtra(intent);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            for (Uri uri : streamUris(intent, true)) files.put(readUri(uri, null));
        } else {
            return null;
        }
        if (files.length() == 0 && (text == null || text.trim().isEmpty())) return null;
        JSObject payload = new JSObject();
        payload.put("token", tokenFor(intent));
        payload.put("files", files);
        if (text != null) payload.put("text", text);
        if (subject != null && !subject.trim().isEmpty()) payload.put("subject", subject);
        return payload;
    }

    private List<Uri> streamUris(Intent intent, boolean multiple) {
        List<Uri> uris = new ArrayList<>();
        if (multiple) {
            ArrayList<Uri> extra = parcelableList(intent);
            if (extra != null) uris.addAll(extra);
        } else {
            Uri uri = parcelableUri(intent, Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        if (uris.isEmpty()) {
            ClipData clip = intent.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri uri = clip.getItemAt(i).getUri();
                    if (uri != null) uris.add(uri);
                }
            }
        }
        return uris;
    }

    private Uri firstClipUri(Intent intent) {
        ClipData clip = intent.getClipData();
        if (clip == null || clip.getItemCount() == 0) return null;
        return clip.getItemAt(0).getUri();
    }

    private String textExtra(Intent intent) {
        CharSequence value = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        return value == null ? null : value.toString();
    }

    private JSObject readUri(Uri uri, String intentType) {
        JSObject file = new JSObject();
        String name = "";
        if (uri == null || !allowedScheme(uri)) {
            file.put("name", name);
            file.put("error", "unreadable");
            return file;
        }
        ContentResolver resolver = getContext().getContentResolver();
        name = displayName(resolver, uri);
        String mime = intentType == null ? "" : intentType;
        try {
            String resolved = resolver.getType(uri);
            if (resolved != null && (mime.isEmpty() || "application/octet-stream".equalsIgnoreCase(mime))) {
                mime = resolved;
            }
        } catch (Exception ignored) {
            // The display name and bytes are still enough to classify the file.
        }
        file.put("name", name);
        file.put("mime", mime);
        boolean docx = isDocx(name, mime);
        try (InputStream input = openStream(resolver, uri)) {
            if (input == null) {
                file.put("error", "unreadable");
                return file;
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BYTES) {
                    file.put("error", "too-large");
                    file.put("size", total);
                    return file;
                }
                output.write(buffer, 0, read);
            }
            byte[] bytes = output.toByteArray();
            file.put("size", bytes.length);
            if (docx) {
                file.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                return file;
            }
            if (containsNul(bytes)) {
                file.put("error", "unsupported");
                return file;
            }
            file.put("text", decodeText(bytes));
            return file;
        } catch (Exception error) {
            file.put("error", "unreadable");
            return file;
        }
    }

    private InputStream openStream(ContentResolver resolver, Uri uri) throws Exception {
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            return new FileInputStream(uri.getPath());
        }
        return resolver.openInputStream(uri);
    }

    private boolean allowedScheme(Uri uri) {
        String scheme = uri.getScheme();
        return "content".equalsIgnoreCase(scheme) || "file".equalsIgnoreCase(scheme);
    }

    private boolean isDocx(String name, String mime) {
        String lower = name == null ? "" : name.toLowerCase(Locale.US);
        if (lower.endsWith(".docx")) return true;
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document".equalsIgnoreCase(mime);
    }

    private boolean containsNul(byte[] bytes) {
        int count = Math.min(bytes.length, 1024);
        for (int i = 0; i < count; i++) {
            if (bytes[i] == 0) return true;
        }
        return false;
    }

    private String decodeText(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xef && (bytes[1] & 0xff) == 0xbb && (bytes[2] & 0xff) == 0xbf) {
            return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        }
        if (bytes.length >= 2 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xfe) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
        }
        if (bytes.length >= 2 && (bytes[0] & 0xff) == 0xfe && (bytes[1] & 0xff) == 0xff) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private String displayName(ContentResolver resolver, Uri uri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.trim().isEmpty()) return name;
                }
            }
        } catch (Exception ignored) {
            // Fall back to the last path segment.
        } finally {
            if (cursor != null) cursor.close();
        }
        String last = uri.getLastPathSegment();
        if (last == null) return "";
        return Uri.decode(last);
    }

    @SuppressWarnings("deprecation")
    private Uri parcelableUri(Intent intent, String key) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableExtra(key, Uri.class);
        return intent.getParcelableExtra(key);
    }

    @SuppressWarnings("deprecation")
    private ArrayList<Uri> parcelableList(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }

    private String tokenFor(Intent intent) {
        return intent == null ? "" : String.valueOf(System.identityHashCode(intent));
    }

    private JSObject emptyPayload() {
        JSObject payload = new JSObject();
        payload.put("files", new JSArray());
        return payload;
    }
}
