package com.h1ddenpr0cess20.wordmark

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.ContextMenu
import android.view.MenuItem
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebSettings
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebResourceRequest
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var prefs: SharedPreferences
    private var appHost: String = DEFAULT_APP_HOST
    private val permissionRequestCode = 1001
    private val locationPermissionRequestCode = 1002
    private val mediaPermissionRequestCode = 1003
    private val notificationPermissionRequestCode = 1004
    private var urlToDownload: String? = null
    private var geolocationCallback: GeolocationPermissions.Callback? = null
    private var geolocationOrigin: String? = null

    // File chooser support
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val results = if (data == null) {
                null
            } else {
                val clipData = data.clipData
                if (clipData != null) {
                    // Multiple files selected
                    Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                } else {
                    // Single file selected
                    data.data?.let { arrayOf(it) }
                }
            }
            filePathCallback?.onReceiveValue(results)
        } else {
            filePathCallback?.onReceiveValue(null)
        }
        filePathCallback = null
    }

    private inner class WebAppInterface {
        @JavascriptInterface
        fun onBlobDataReady(dataUrl: String) {
            this@MainActivity.runOnUiThread {
                // Create a hash of the data URL for duplicate checking
                val dataHash = dataUrl.hashCode().toString()
                val currentTime = System.currentTimeMillis()
                val lastDownloadTime = downloadTimeouts[dataHash] ?: 0L

                // Check if this exact data was recently processed (within 3 seconds)
                if (currentTime - lastDownloadTime < 3000) {
                    // Silently ignore duplicates without showing notification
                    return@runOnUiThread
                }

                // Update the tracking
                downloadTimeouts[dataHash] = currentTime

                when {
                    // Handle text/JSON downloads (conversation exports)
                    dataUrl.startsWith("data:") && (dataUrl.contains("text/") || dataUrl.contains("json")) -> {
                        saveDataUrlAsFile(dataUrl)
                    }
                    // Handle image downloads (from download buttons)
                    dataUrl.startsWith("data:") && dataUrl.contains("image/") -> {
                        saveDataUrlAsFile(dataUrl)
                    }
                    // Convert blob URLs to data URLs
                    dataUrl.startsWith("blob:") -> {
                        convertBlobToDataUrl(dataUrl)
                    }
                    // Handle HTTP downloads (external files)
                    dataUrl.startsWith("http") -> {
                        downloadFile(dataUrl, null, null)
                    }
                    // Skip audio files - let web app handle them
                    else -> {
                        if (!dataUrl.contains("audio") && !isLikelyAudioData(dataUrl)) {
                            Toast.makeText(this@MainActivity, "Unsupported URL format: $dataUrl", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        }

        @JavascriptInterface
        fun onDataUrlConverted(dataUrl: String) {
            this@MainActivity.runOnUiThread {
                // Create a hash of the data URL for duplicate checking
                val dataHash = dataUrl.hashCode().toString()
                val currentTime = System.currentTimeMillis()
                val lastDownloadTime = downloadTimeouts[dataHash] ?: 0L

                // Check if this exact data was recently processed (within 3 seconds)
                if (currentTime - lastDownloadTime < 3000) {
                    // Silently ignore duplicates without showing notification
                    return@runOnUiThread
                }

                // Update the tracking
                downloadTimeouts[dataHash] = currentTime

                // Save text/JSON files (conversation exports) and images (download buttons)
                if (dataUrl.contains("text/") || dataUrl.contains("json") || dataUrl.contains("image/")) {
                    saveDataUrlAsFile(dataUrl)
                }
                // Skip audio files
            }
        }
    }

    private fun isLikelyAudioData(data: String): Boolean {
        // Check if the data looks like audio (common audio file signatures)
        return data.contains("audio") ||
               data.startsWith("ID3") || // MP3 header
               data.startsWith("OggS") || // OGG header
               data.startsWith("RIFF") // WAV header
    }

    @Suppress("SetJavaScriptEnabled", "DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)

        val mainContainer: View = findViewById(R.id.main_container)
        webView = findViewById(R.id.webview)
        webView.addJavascriptInterface(WebAppInterface(), "AndroidInterface")

        // Basic settings optimized for the Wordmark web app
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true // Enable IndexedDB for conversation storage
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true
            allowContentAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            mediaPlaybackRequiresUserGesture = false // Allow auto-play for TTS
            setGeolocationEnabled(true) // For location-based features

            // Enhanced settings for Ollama server connectivity
            blockNetworkImage = false
            blockNetworkLoads = false
            loadsImagesAutomatically = true
            javaScriptCanOpenWindowsAutomatically = true

            // User agent to ensure proper web app compatibility
            userAgentString = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36 WordmarkApp"
        }

        // Handle cookies
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Set WebViewClient
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val scheme = url.scheme?.lowercase()

                // Content the web app itself produces/handles: keep it in the WebView.
                if (scheme == "data" || scheme == "blob" || scheme == "javascript" || scheme == "about") {
                    return false
                }

                if (scheme == "http" || scheme == "https") {
                    val host = url.host.orEmpty()
                    // The Wordmark web app (and any subdomain) stays in-app; all API/fetch
                    // calls to OpenAI/xAI/local servers are XHR and never reach this method.
                    if (host == appHost || host.endsWith(".$appHost")) {
                        return false
                    }
                }

                // Everything else (external sites, mailto:, tel:, etc.) opens externally.
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    })
                    true
                } catch (e: Exception) {
                    // No app can handle it; let the WebView try rather than dropping the link.
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Inject JavaScript to handle blob downloads
                injectDownloadScript()
            }

            override fun onReceivedSslError(view: WebView?, handler: android.webkit.SslErrorHandler?, error: android.net.http.SslError?) {
                // Proceed past certificate errors only for local/LAN servers (self-signed
                // LM Studio/Ollama). Reject invalid certs for public sites to avoid MITM.
                val host = runCatching { Uri.parse(error?.url ?: "").host }.getOrNull().orEmpty()
                if (isLocalOrLanHost(host)) {
                    handler?.proceed()
                } else {
                    handler?.cancel()
                }
            }

            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                // Log network errors to help debug connectivity issues
                if (failingUrl?.contains("localhost") == true ||
                    failingUrl?.contains("127.0.0.1") == true ||
                    failingUrl?.contains("192.168") == true ||
                    failingUrl?.contains("10.0") == true) {
                    // This might be a local LM Studio/Ollama server connection issue
                    android.util.Log.w(TAG, "Network error connecting to potential local AI server: $description")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                geolocationOrigin = origin
                geolocationCallback = callback
                ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), locationPermissionRequestCode)
            }

            // File chooser for file input elements
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.filePathCallback = filePathCallback
                // Create an intent to open the file chooser
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*" // Allow all file types
                    // For multiple file selection
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                // Launch the file chooser
                fileChooserLauncher.launch(intent)
                return true
            }
        }

        // Register for context menu (long press)
        registerForContextMenu(webView)

        // Set download listener
        webView.setDownloadListener { url, _, contentDisposition, mimetype, _ ->
            // Check if this download was already handled by JavaScript
            val currentTime = System.currentTimeMillis()
            val lastDownloadTime = downloadTimeouts[url] ?: 0L

            // Only proceed if not recently downloaded (within 3 seconds)
            if (currentTime - lastDownloadTime >= 3000) {
                downloadFile(url, contentDisposition, mimetype)
            }
        }

        // On first run, ask whether to use the hosted version or a self-hosted
        // server; afterwards, load whichever server was chosen.
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_SERVER_URL, null)
        if (savedUrl != null) {
            loadServer(savedUrl)
        } else {
            showFirstRunServerPrompt()
        }

        // Handle back press
        ViewCompat.setOnApplyWindowInsetsListener(mainContainer) { view, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.updatePadding(
                left = insets.left,
                top = insets.top,
                right = insets.right,
                bottom = insets.bottom
            )
            WindowInsetsCompat.CONSUMED
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    /**
     * First-run choice between the hosted Wordmark instance and a
     * self-hosted server. The answer is persisted, so the prompt only
     * appears again if app data is cleared.
     */
    private fun showFirstRunServerPrompt() {
        AlertDialog.Builder(this, R.style.ThemeOverlay_Wordmark_Dialog)
            .setTitle(R.string.server_choice_title)
            .setMessage(R.string.server_choice_message)
            .setCancelable(false)
            .setPositiveButton(R.string.server_choice_hosted) { _, _ ->
                saveAndLoadServer(DEFAULT_APP_URL)
            }
            .setNegativeButton(R.string.server_choice_custom) { _, _ ->
                showCustomServerDialog()
            }
            .show()
    }

    private fun showCustomServerDialog() {
        val view = layoutInflater.inflate(R.layout.dialog_server_url, null)
        val input = view.findViewById<EditText>(R.id.server_url_input)
        val dialog = AlertDialog.Builder(this, R.style.ThemeOverlay_Wordmark_Dialog)
            .setTitle(R.string.server_url_title)
            .setMessage(R.string.server_url_message)
            .setView(view)
            .setCancelable(false)
            .setPositiveButton(R.string.server_url_connect, null) // Overridden below to validate first
            .setNegativeButton(R.string.server_url_back) { _, _ -> showFirstRunServerPrompt() }
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val normalized = normalizeServerUrl(input.text.toString())
                if (normalized == null) {
                    input.error = getString(R.string.server_url_invalid)
                } else {
                    dialog.dismiss()
                    saveAndLoadServer(normalized)
                }
            }
        }
        dialog.show()
    }

    /**
     * Accepts host, host:port, or full http(s) URLs; a missing scheme
     * defaults to https. Returns null if no usable http(s) URL results.
     */
    private fun normalizeServerUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
        val uri = runCatching { withScheme.toUri() }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        if (uri.host.isNullOrEmpty()) return null
        return withScheme
    }

    private fun saveAndLoadServer(url: String) {
        prefs.edit().putString(KEY_SERVER_URL, url).apply()
        loadServer(url)
    }

    private fun loadServer(url: String) {
        appHost = url.toUri().host.orEmpty().ifEmpty { DEFAULT_APP_HOST }
        webView.loadUrl(url)
    }

    private fun injectDownloadScript() {
        val jsCode = """
            javascript:(function() {
                console.log('Wordmark Android: Injecting download handlers');
                
                // Track processed URLs with timestamps to prevent duplicates
                var processedUrls = new Map();
                var DUPLICATE_TIMEOUT = 3000; // 3 seconds
                
                function isRecentlyProcessed(url) {
                    var now = Date.now();
                    if (processedUrls.has(url)) {
                        var lastTime = processedUrls.get(url);
                        if (now - lastTime < DUPLICATE_TIMEOUT) {
                            console.log('Wordmark Android: Duplicate prevented (recent):', url);
                            return true;
                        }
                    }
                    processedUrls.set(url, now);
                    
                    // Clean up old entries
                    for (var [key, value] of processedUrls.entries()) {
                        if (now - value > DUPLICATE_TIMEOUT) {
                            processedUrls.delete(key);
                        }
                    }
                    return false;
                }
                
                // Intercept blob URLs for downloads (excluding audio for IndexedDB)
                var originalCreateObjectURL = window.URL.createObjectURL;
                window.URL.createObjectURL = function(blob) {
                    var url = originalCreateObjectURL.apply(this, arguments);
                    console.log('Wordmark Android: Blob URL created:', url, 'Type:', blob.type);
                    
                    // Handle text/JSON and image files for downloads
                    if (blob && blob.type && (blob.type.includes('text/') || blob.type.includes('json') || blob.type.includes('image/'))) {
                        if (!isRecentlyProcessed(url)) {
                            console.log('Wordmark Android: Processing download blob');
                            var reader = new FileReader();
                            reader.onload = function() {
                                AndroidInterface.onBlobDataReady(reader.result);
                            };
                            reader.readAsDataURL(blob);
                        }
                    } else if (blob && blob.type && blob.type.includes('audio/')) {
                        console.log('Wordmark Android: Skipping audio blob for IndexedDB');
                    }
                    
                    return url;
                };

                // Intercept download clicks with stronger duplicate prevention
                document.addEventListener('click', function(event) {
                    var target = event.target;
                    
                    // Check for download attributes or classes
                    while (target && target !== document) {
                        var href = target.getAttribute && target.getAttribute('href');
                        var download = target.getAttribute && target.getAttribute('download');
                        
                        if (href && (href.startsWith('blob:') || href.startsWith('data:') || download)) {
                            // Skip audio files - let web app handle them
                            if (href.includes('audio/') || (download && (download.includes('.mp3') || download.includes('.wav') || download.includes('.ogg')))) {
                                console.log('Wordmark Android: Skipping audio download for IndexedDB');
                                return true; // Let the web app handle it
                            }
                            
                            // Handle images and text/JSON files with strict duplicate prevention
                            if (!isRecentlyProcessed(href)) {
                                console.log('Wordmark Android: Processing download:', href);
                                event.preventDefault();
                                AndroidInterface.onBlobDataReady(href);
                            } else {
                                console.log('Wordmark Android: Duplicate download blocked:', href);
                                event.preventDefault(); // Still prevent default to avoid browser download
                            }
                            return false;
                        }
                        
                        target = target.parentNode;
                    }
                });

                console.log('Wordmark Android: Download handlers injected successfully');
            })();
        """.trimIndent()

        webView.evaluateJavascript(jsCode, null)
    }

    override fun onCreateContextMenu(menu: ContextMenu, v: View, menuInfo: ContextMenu.ContextMenuInfo?) {
        super.onCreateContextMenu(menu, v, menuInfo)

        // Get HitTestResult to identify what was long-pressed
        val result = webView.hitTestResult

        // Check if an image was long-pressed
        if (result.type == WebView.HitTestResult.IMAGE_TYPE ||
            result.type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {

            // Add menu options
            menu.setHeaderTitle("Image Options")
            menu.add(0, 1, 0, "Save Image")

            // Store the URL of the image
            urlToDownload = result.extra
        }
    }

    override fun onContextItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            1 -> {
                // User selected "Save Image"
                urlToDownload?.let {
                    downloadFile(it, null, null)
                    return true
                }
            }
        }
        return super.onContextItemSelected(item)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            permissionRequestCode, mediaPermissionRequestCode -> {
                val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }

                if (allGranted) {
                    urlToDownload?.let { downloadFile(it, "", "") }
                } else {
                    Toast.makeText(this, "Permissions are required to download files", Toast.LENGTH_LONG).show()
                }
            }
            locationPermissionRequestCode -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    geolocationCallback?.invoke(geolocationOrigin, true, false)
                } else {
                    geolocationCallback?.invoke(geolocationOrigin, false, false)
                }
            }
            notificationPermissionRequestCode -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Toast.makeText(this, "Notification permission granted", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Download notifications may not work without permission", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    // Add download tracking to prevent duplicates
    private val recentDownloads = mutableSetOf<String>()
    private val downloadTimeouts = mutableMapOf<String, Long>()

    private fun downloadFile(url: String, contentDisposition: String?, mimetype: String?) {
        // Create a unique key for this download request
        val downloadKey = "$url|$contentDisposition|$mimetype"
        val currentTime = System.currentTimeMillis()
        val lastDownloadTime = downloadTimeouts[downloadKey] ?: 0L

        // If the download was recent (within 5 seconds), ignore this request
        if (currentTime - lastDownloadTime < 5000) {
            Toast.makeText(this, "Download already in progress or recently completed", Toast.LENGTH_SHORT).show()
            return
        }

        // Check permissions first
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), notificationPermissionRequestCode)
            }
        }

        try {
            val request = DownloadManager.Request(url.toUri())
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimetype)

            // Set description and notification visibility
            request.setDescription("Downloading file...")
            request.setTitle(fileName)
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)

            // Use scoped storage for all Android versions
            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                fileName
            )

            // Allow downloads over mobile networks
            request.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE)
            request.setAllowedOverRoaming(false)

            // Get download service and enqueue the request
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)

            Toast.makeText(applicationContext, "Starting download: $fileName", Toast.LENGTH_SHORT).show()

            // Update the download tracking with the unique key
            downloadTimeouts[downloadKey] = currentTime

            // Clean up old entries to prevent memory leaks
            downloadTimeouts.entries.removeAll { (_, time) -> currentTime - time > 300000 } // 5 minutes

        } catch (e: Exception) {
            Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun saveDataUrlAsFile(dataUrl: String) {
        try {
            var decodedBytes: ByteArray
            var mimeType: String
            var fileExtension: String

            when {
                // Handle proper data URLs
                dataUrl.startsWith("data:") && dataUrl.contains(",") -> {
                    val commaIndex = dataUrl.indexOf(',')
                    val metadataPart = dataUrl.substring(0, commaIndex)
                    val dataPart = dataUrl.substring(commaIndex + 1)

                    mimeType = metadataPart.substringAfter("data:").substringBefore(";")

                    if (metadataPart.contains(";base64")) {
                        decodedBytes = android.util.Base64.decode(dataPart, android.util.Base64.DEFAULT)
                    } else {
                        // Handle URL-encoded data
                        decodedBytes = java.net.URLDecoder.decode(dataPart, "UTF-8").toByteArray()
                    }
                }
                // Handle blob URLs by trying to fetch them
                dataUrl.startsWith("blob:") -> {
                    Toast.makeText(this, "Converting blob URL to downloadable format...", Toast.LENGTH_SHORT).show()
                    convertBlobToDataUrl(dataUrl)
                    return
                }
                // Handle direct binary data or other formats
                else -> {
                    // Try to detect if it's base64 encoded data without proper data URL format
                    if (dataUrl.matches(Regex("^[A-Za-z0-9+/]*={0,2}$"))) {
                        try {
                            decodedBytes = android.util.Base64.decode(dataUrl, android.util.Base64.DEFAULT)
                            // Assume it's audio if we can't determine the type
                            mimeType = "audio/mpeg"
                        } catch (e: Exception) {
                            throw IllegalArgumentException("Invalid data format: cannot decode as base64")
                        }
                    } else {
                        // Try to treat as raw audio data
                        decodedBytes = dataUrl.toByteArray(Charsets.ISO_8859_1)
                        mimeType = "audio/mpeg"
                    }
                }
            }

            fileExtension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: when {
                mimeType.startsWith("audio/") -> "mp3"
                mimeType.startsWith("image/") -> "jpg"
                mimeType.startsWith("text/") -> "txt"
                else -> "bin"
            }

            val prefix = when {
                mimeType.startsWith("image/") -> "saved_image_"
                mimeType.startsWith("audio/") -> "saved_audio_"
                mimeType.startsWith("text/") -> "conversation_"
                mimeType.contains("json") -> "conversation_"
                else -> "saved_file_"
            }
            val fileName = "${prefix}${System.currentTimeMillis()}.$fileExtension"

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) {
                downloadsDir.mkdirs()
            }
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { outputStream ->
                outputStream.write(decodedBytes)
            }

            // Notify the media scanner about the new file so that it is immediately available to the user.
            MediaScannerConnection.scanFile(this, arrayOf(file.toString()), arrayOf(mimeType)) { _, _ ->
                // File scanning complete
            }

            Toast.makeText(this, "File saved to Downloads folder: $fileName", Toast.LENGTH_SHORT).show()

        } catch (e: Exception) {
            Toast.makeText(this, "Failed to save file: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun convertBlobToDataUrl(blobUrl: String) {
        // JavaScript code to convert blob URL to data URL
        val jsCode = """
            (function() {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', '$blobUrl', true);
                xhr.responseType = 'blob';
                xhr.onload = function() {
                    if (this.status === 200) {
                        var reader = new FileReader();
                        reader.onloadend = function() {
                            // Notify the Android app with the data URL
                            AndroidInterface.onDataUrlConverted(reader.result);
                        };
                        reader.readAsDataURL(this.response);
                    } else {
                        AndroidInterface.onDataUrlConverted('');
                    }
                };
                xhr.onerror = function() {
                    AndroidInterface.onDataUrlConverted('');
                };
                xhr.send();
            })();
        """.trimIndent()

        webView.evaluateJavascript(jsCode, null)
    }

    /**
     * True for loopback and RFC 1918 private/LAN hosts (where users run local
     * LM Studio/Ollama servers, often with self-signed certificates).
     */
    private fun isLocalOrLanHost(host: String): Boolean {
        if (host.isEmpty()) return false
        return host == "localhost" ||
            host == "127.0.0.1" ||
            host == "::1" ||
            host.endsWith(".local") ||
            host.startsWith("10.") ||
            host.startsWith("192.168.") ||
            Regex("^172\\.(1[6-9]|2[0-9]|3[0-1])\\.").containsMatchIn(host)
    }

    companion object {
        private const val DEFAULT_APP_URL = "https://wordmark-chatbot.vercel.app/"
        private const val DEFAULT_APP_HOST = "wordmark-chatbot.vercel.app"
        private const val PREFS_NAME = "wordmark_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val TAG = "WordmarkApp"
    }
}
