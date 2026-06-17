# Android App

Wordmark ships an optional native Android wrapper in [`android/`](../android). It is a thin shell — a single `Activity` (`MainActivity.kt`) hosting a full-screen `WebView` that loads the deployed web app (`https://wordmark-chatbot.vercel.app/`). All app logic still lives in the web app; the native layer only adds platform integration that a plain browser tab cannot provide.

The web app runs identically to the browser: API calls go straight from the device to the OpenAI/xAI endpoint or a local LM Studio/Ollama server, and all conversation data stays in the WebView's local storage / IndexedDB. There is no backend.

## What the native shell adds

- **Downloads & exports** — chat exports (JSON/text) and generated images are intercepted from `blob:`/`data:` URLs and saved to the device **Downloads** folder via `DownloadManager`/`MediaScanner`. A JavaScript bridge (`AndroidInterface`) injected on `onPageFinished` forwards blob data to the native side, with duplicate-click suppression.
- **File uploads** — `<input type="file">` opens the system file picker (single or multiple).
- **Geolocation** — prompts for the Android location permission when the web app requests it.
- **Long-press "Save image"** — context menu on images in the WebView.
- **Back navigation** — the hardware/gesture back button walks WebView history, then exits.
- **Edge-to-edge** — draws under the system bars with inset-aware padding.

## Identity & requirements

| | |
|---|---|
| applicationId | `com.h1ddenpr0cess20.wordmark` |
| minSdk / targetSdk | 24 / 36 |
| Build JDK | 17 (to run Gradle 8.13 / AGP 8.11) |
| App bytecode target | Java 11 |

## Local AI servers

Cleartext traffic and loopback/RFC-1918 LAN hosts are permitted (`res/xml/network_security_config.xml`) so the web app can reach a local LM Studio or Ollama server from the device. See [LM Studio](lm-studio.md) and [Ollama](ollama.md).

For TLS, self-signed certificates are accepted **only** for loopback/LAN hosts; invalid certificates on public sites are rejected. Links to other domains (and `mailto:`/`tel:`) open in the system browser, while the Wordmark app itself stays in the WebView — `fetch`/XHR API traffic is never treated as navigation, so it is unaffected.

## Build

```bash
cd android
echo "sdk.dir=$HOME/Android/Sdk" > local.properties   # if not already present

JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk
```

Install and launch on a device or emulator with `adb`:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.h1ddenpr0cess20.wordmark/.MainActivity
```

Every APK is signed; the debug APK uses Android's shared debug key, which is fine for sideloading to your own devices.

## Release builds & signing

A release build is only signed if a `keystore.properties` file exists at the `android/` root (git-ignored, along with `*.jks`/`*.keystore`). Without it, debug builds still work and `assembleRelease` produces an unsigned APK.

```properties
# android/keystore.properties
storeFile=/absolute/path/to/wordmark-release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

```bash
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleRelease
```

Release builds run R8/minify. A keep rule in `app/proguard-rules.pro` preserves the `@JavascriptInterface` methods so the download/export bridge survives minification — do not remove it.

> **Keep your release keystore safe.** If this app is ever published to the Play Store, losing the keystore means you can no longer ship updates under the same identity.

## Distribution & Google developer verification

Wordmark is not on the Play Store — it is distributed by sideloading the signed APK. Google is rolling out **Android developer verification**, which requires every app installed on **GMS-certified devices** to be registered to a verified developer identity, *including sideloaded apps*. The notes below are accurate as of **June 2026**; this is an evolving policy, so confirm against Google's [verification timeline](https://support.google.com/android-developer-console/answer/16650243) before relying on it.

Timeline (key points):

- **Apr 2026** — an "Android Developer Verifier" system service begins appearing on devices.
- **Jun 2026** — Limited Distribution Accounts for students/hobbyists (no government ID required).
- **Aug 2026** — global rollout of limited-distribution accounts plus an "advanced flow for power users."
- **Sep 30, 2026** — enforcement begins in **Brazil, Indonesia, Singapore, and Thailand**.
- **2027+** — gradual global expansion (no firm dates announced).

What this means for this app:

- **Local builds and `adb install` keep working.** Installing via ADB (and an "advanced sideloading flow" for power users) remains available for unregistered apps, so the dev/test workflow above is unaffected.
- **Non-certified / AOSP devices** are outside the scope of the requirement.
- **Handing the APK to others to tap-install** will, once enforcement reaches a given region, require a verified developer identity with the app registered. For a hobby project, a **Limited Distribution Account** (no government ID, shareable to ~20 devices) is the likely route.
- Verification is tied to the **signing key**, which is another reason to preserve the release keystore.

See [`android/README.md`](../android/README.md) for the most build-specific notes.
