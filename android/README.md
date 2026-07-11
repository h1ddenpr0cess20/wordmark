# Wordmark Android (WebView wrapper)

A thin native Android shell that loads the Wordmark web app in a full-screen
`WebView`, adding native download handling, file uploads, geolocation prompts,
and image long-press "Save image". All app logic still lives in the web app.

On first launch the app asks whether to use the hosted version
(`https://wordmark-chatbot.vercel.app/`) or a server URL you provide (for
self-hosted instances, e.g. `http://192.168.1.100:5173`). The choice is
persisted; to pick again, clear the app's data in Android settings.

- **Package / applicationId:** `com.h1ddenpr0cess20.wordmark`
- **minSdk 24 · targetSdk 36**
- Single activity: `app/src/main/java/com/h1ddenpr0cess20/wordmark/MainActivity.kt`

## Build

Requires **JDK 17** (to run Gradle/AGP 8.11) and the Android SDK.

```bash
# Point Gradle at your SDK (already present if you used Android Studio)
echo "sdk.dir=$HOME/Android/Sdk" > local.properties

JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk
```

The app itself targets Java 11 bytecode; JDK 17 is only needed to run the build.

## Release signing

A release build is only signed if a `keystore.properties` exists at the
`android/` root (git-ignored). Without it, `assembleDebug` still works and
`assembleRelease` builds unsigned. Format:

```properties
storeFile=/absolute/path/to/keystore.jks
storePassword=...
keyAlias=...
keyPassword=...
```

## Local AI servers (LM Studio / Ollama)

Cleartext traffic and LAN/loopback hosts are permitted so the web app can reach
a local LM Studio/Ollama server (see `res/xml/network_security_config.xml`).
Self-signed TLS certs are accepted **only** for loopback/RFC-1918 hosts; invalid
certs on public sites are rejected.

## Differences from the original Tyumi wrapper

This started as a port of an older WebView wrapper. Behavior was preserved
except for two deliberate hardening fixes:

- **TLS:** the original accepted any invalid certificate on any host. Now bad
  certs are accepted only for local/LAN servers (preserving the local-AI use
  case) and rejected for public sites.
- **External links:** links to other domains and `mailto:`/`tel:` open in the
  system browser; the Wordmark app itself stays in the WebView. API/`fetch`
  calls are unaffected (they never trigger navigation).
