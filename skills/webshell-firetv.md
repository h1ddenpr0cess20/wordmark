---
name: Fire TV via WebShell (ADB)
description: Use when you have the webshell MCP server (a sandbox shell with adb on PATH) and want to control an Amazon Fire TV through raw ADB commands instead of the dedicated firetv MCP server. Covers connecting/pairing, the observe-act loop, seeing the screen (screencap + the uiautomator text trick), D-pad/media/text input, tapping by bounds, launching apps via intents, app/device/notification introspection, sideloading, logcat debugging, and surfacing media through webshell's file tools.
---

You are controlling an Amazon Fire TV by issuing **`adb` commands through the
webshell sandbox's `execute_command`** — reproducing (and exceeding) what the
dedicated firetv MCP server does, but by hand. This pairs two skills' worth of
discipline: the **WebShell Operator** rules (each `execute_command` is its own
shell; chain with `&&`, persist state to a sourced file) and the **Fire TV**
rules: the *remote* has no pointer, so the primary input is moving a focus
highlight with the D-pad — **look, make one move, look again**. (ADB does add a
`input tap`/`swipe` escape hatch many apps honor; see "Tapping by bounds".) Most
failures are acting blind or losing track of focus.

## Connect once, then reuse the target
ADB is stateful on the *device* side but your shell calls are not, so pin the
target and wrap the verbose command:
```bash
# Do this once; the adb server keeps the connection alive across calls.
adb connect 192.168.1.50:5555 && adb devices        # expect "...:5555  device"
```
- If `adb devices` shows `offline`/`unauthorized`, re-`connect` (and accept the
  ADB prompt on the TV the first time). A dropped connection is the usual reason
  commands "do nothing."
- **Newer Fire OS (Android 11+ base) may require wireless pairing** before
  connect: enable *Wireless debugging* on the device, then
  `adb pair <ip>:<pair-port>` with the 6-digit code shown on screen, and only
  then `adb connect <ip>:5555`.
- **Batch to cut round-trips.** Every `adb shell` call is a network hop; chain
  device-side work in one shell with `;`:
  `adb -s "$FTV" shell 'input keyevent 22; sleep 0.2; input keyevent 23'`.
- Persist the host and helper functions to a file you `source` each call, since
  shell state doesn't survive:
```bash
cat > /tmp/ftv.sh <<'EOF'
FTV=192.168.1.50:5555
key(){ adb -s "$FTV" shell input keyevent "$1"; }     # one keyevent
keyn(){ for _ in $(seq "$2"); do key "$1"; sleep "${3:-0.3}"; done; }  # repeat
shot(){ adb -s "$FTV" exec-out screencap -p > "${1:-/tmp/ftv.png}"; }
EOF
# then every call:  source /tmp/ftv.sh && key 20
```

## The golden rule: observe → one move → observe
Don't fire a batch of D-pad presses blind. Loop: **see the screen and which
element is highlighted → make one small move → see it again.** When unsure where
focus is, capture state — don't guess.

## Seeing the screen — two ways, use both
**1. Screenshot (vision).** Capture with `exec-out` (avoids the `\r\n` mangling
that plain `adb shell screencap` causes), then **surface it so it can actually
be viewed** — capturing to a sandbox file is not seeing it:
```bash
source /tmp/ftv.sh && shot /tmp/ftv.png
# shrink for fast viewing/low tokens (probe for the tool first):
command -v magick convert ffmpeg 2>/dev/null
magick /tmp/ftv.png -resize 1024x1024\> -quality 60 /tmp/ftv.jpg   # or convert/ffmpeg
```
Then hand it over with webshell's file tools: `download_file` (to the local
machine) or `fetch_file` (serves it over local HTTP on port 9712 as a URL). Pull
a fresh shot after each consequential move.

**2. UI hierarchy (text — often better for focus).** This is the big advantage
of doing it by hand: dump the view tree and read **exactly which node is
focused**, with its text and bounds, no vision needed:
```bash
adb -s "$FTV" shell uiautomator dump /sdcard/ui.xml >/dev/null \
  && adb -s "$FTV" shell cat /sdcard/ui.xml > /tmp/ui.xml
grep -o '[^>]*focused="true"[^>]*' /tmp/ui.xml      # the focused element + its bounds/text
```
Use the XML to know what's selected and how far the target is; use a screenshot
when you need to actually see layout/art. They complement each other.

## Tapping by bounds (the shortcut the remote can't do)
Each `uiautomator` node carries `bounds="[x1,y1][x2,y2]"`. You can tap the center
of a target directly instead of D-pad-walking to it:
```bash
# pull the node you want (e.g. by its text), then tap its center:
b=$(grep -o 'text="Search"[^>]*bounds="\[[0-9,]*\]\[[0-9,]*\]"' /tmp/ui.xml \
     | grep -o 'bounds="[^"]*"' | grep -o '[0-9]*' )    # -> x1 y1 x2 y2
set -- $b; adb -s "$FTV" shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
adb -s "$FTV" shell input swipe 960 800 960 200 300      # scroll up (x1 y1 x2 y2 ms)
```
- **Caveat:** many leanback/TV apps ignore touch and only respond to D-pad — so
  `input tap` is a powerful shortcut where it works, but verify with a dump/shot
  afterward and fall back to D-pad navigation if nothing moved.
- `input swipe` doubles as a scroll for long lists when repeated D-pad presses
  are slow.

## Input: keyevents, text, media
D-pad and system keys are `input keyevent <code>` (names work too, e.g.
`KEYCODE_DPAD_UP`):

| Action | Code | | Action | Code |
|---|---|---|---|---|
| D-pad up/down | 19 / 20 | | Select/Enter | 23 / 66 |
| D-pad left/right | 21 / 22 | | Back | 4 |
| Home | 3 | | Menu | 82 |
| Media play/pause | 85 | | Play / Pause | 126 / 127 |
| Volume up/down | 24 / 25 | | Mute | 164 |
| Wake / Sleep | 224 / 223 | | Power | 26 |

- Move with intent but verify: `keyn 22 3` presses right three times with a delay
  — then screenshot/dump to confirm. **Slow down near the target** (single `key`
  presses) and watch for grid wrap / uneven rows.
- **Text input** types into the *currently focused* field — focus it first.
  Spaces and specials are the classic trap: `input text` treats space specially.
```bash
adb -s "$FTV" shell input text 'hello%sworld'   # %s = space; escape & ' " ( ) etc.
key 66                                           # submit (Enter), or navigate to a result
```
  To clear a field, send repeated DEL: `keyn 67 20 0.05`.
- **Unicode / spaces / long text reliably**: `input text` mangles many
  characters. The robust trick is the **ADBKeyboard** IME — sideload it, make it
  active, then broadcast text:
  `adb -s "$FTV" shell ime set com.android.adbkeyboard/.AdbIME` then
  `adb -s "$FTV" shell am broadcast -a ADB_INPUT_TEXT --es msg 'café déjà vu'`
  (restore the original IME with `ime reset` after).
- Lost or focus somewhere weird? `key 3` (Home) to return to a known state rather
  than pressing deeper.

## Prefer a direct intent over walking the UI
Crossing the home screen with D-pad presses is the slow, error-prone path. Jump
straight there:
```bash
# Current app / activity (verify where you are):
adb -s "$FTV" shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp'
# List packages to find the one you want:
adb -s "$FTV" shell pm list packages | grep -i netflix
# Launch an app (LAUNCHER intent — robust without knowing the activity):
adb -s "$FTV" shell monkey -p com.netflix.ninja -c android.intent.category.LAUNCHER 1
# ...or a known activity / a deep link:
adb -s "$FTV" shell am start -n com.amazon.tv.launcher/.ui.HomeActivity
adb -s "$FTV" shell am start -a android.intent.action.VIEW -d 'https://www.youtube.com/watch?v=...'
# Now-playing / media state:
adb -s "$FTV" shell dumpsys media_session | grep -iA3 'state=PlaybackState'
# Force-stop an app:
adb -s "$FTV" shell am force-stop com.netflix.ninja
```
Reserve D-pad navigation for picking a tile/row *within* a screen where no intent
reaches the target.

## App management (install, sideload, remove, reset)
```bash
adb -s "$FTV" install -r -g app.apk                  # sideload/update (-g grants perms)
# webshell side: bring the APK in first with upload_file, then install it.
adb -s "$FTV" shell pm list packages -3              # third-party (user-installed) only
adb -s "$FTV" shell pm path com.netflix.ninja        # where an app's APK lives
adb -s "$FTV" uninstall com.example.app              # remove
adb -s "$FTV" shell pm clear com.netflix.ninja       # wipe app data (fresh state)
adb -s "$FTV" shell pm disable-user --user 0 com.x   # disable bloat without removing
```

## Introspection — know the device and what's on screen
```bash
# device / build:
adb -s "$FTV" shell getprop ro.product.model; adb -s "$FTV" shell getprop ro.build.version.release
adb -s "$FTV" shell wm size; adb -s "$FTV" shell wm density   # resolution / dpi
adb -s "$FTV" shell dumpsys battery | grep -E 'level|status'
# what app/activity is resumed (more precise than mCurrentFocus):
adb -s "$FTV" shell dumpsys activity activities | grep -E 'mResumedActivity|ResumedActivity'
# network:
adb -s "$FTV" shell ip -f inet addr show wlan0 | grep inet
adb -s "$FTV" shell cmd wifi status 2>/dev/null || adb -s "$FTV" shell dumpsys wifi | grep -i ssid
# notifications / settings:
adb -s "$FTV" shell dumpsys notification --noredact | grep -E 'tickerText|text='
adb -s "$FTV" shell am start -a android.settings.SETTINGS        # open Settings
adb -s "$FTV" shell am start -a android.settings.WIFI_SETTINGS   # a specific pane
```
- Brightness/volume via settings: `settings put system screen_brightness <0-255>`;
  reboot with `adb -s "$FTV" reboot`.

## Capture media to hand off
```bash
# screenshot (exec-out avoids \r\n corruption) -> downscale -> surface:
adb -s "$FTV" exec-out screencap -p > /tmp/ftv.png
# screen recording (device-side; has a time limit, runs until stopped):
adb -s "$FTV" shell screenrecord --time-limit 20 --bit-rate 4000000 /sdcard/rec.mp4
adb -s "$FTV" pull /sdcard/rec.mp4 /tmp/rec.mp4 && adb -s "$FTV" shell rm /sdcard/rec.mp4
```
Then surface `/tmp/ftv.png` or `/tmp/rec.mp4` with webshell's `download_file`
(to the local machine) or `fetch_file` (local HTTP URL on port 9712).

## Debugging with logcat
When an app misbehaves or you can't tell why a launch failed, watch its logs:
```bash
adb -s "$FTV" logcat -c                                   # clear, then reproduce
adb -s "$FTV" logcat -d -v brief *:E | tail -50           # recent errors, one shot
adb -s "$FTV" logcat -d --pid=$(adb -s "$FTV" shell pidof -s com.netflix.ninja)  # one app
```
`-d` dumps and exits (don't leave a streaming `logcat` blocking a call — run it
detached and `tail` the file, per the Operator skill's background pattern).

## Timing and device state
- The UI isn't instant — app launches and transitions take time. After a launch
  or a transition, `sleep` briefly (or poll `mCurrentFocus`) **before** the next
  screenshot, so you're not reading a half-rendered frame.
- Wake first: `adb -s "$FTV" shell dumpsys power | grep 'mWakefulness'`; if
  asleep, `key 224` (WAKEUP) — commands to a sleeping screen appear to do nothing.
- An `adb` command can hang if the device is busy; it returns nonzero on
  connection loss. A failure means re-check the connection and real screen state,
  not that the action definitely happened.

## How to respond
- Narrate by intent and *verified* state, not key spam: "Launched Netflix
  (confirmed via `mCurrentFocus`), focus is on the top rail per the uiautomator
  dump." Your screenshot or XML dump is the evidence.
- Prefer the text `uiautomator` dump to know focus; pull a screenshot when you
  need to see layout — and actually surface it (`download_file`/`fetch_file`),
  since a file in the sandbox isn't something you've seen.
- When a direct intent does what the user asked, use it and say so instead of
  describing a long D-pad route.
- If something failed (offline device, lost focus, app didn't open), report what
  the dump/screenshot actually shows and your next step — don't claim success you
  haven't verified.
