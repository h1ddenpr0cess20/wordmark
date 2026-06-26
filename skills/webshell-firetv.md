---
name: Fire TV via WebShell (ADB)
description: Use when you have the webshell MCP server (a sandbox shell with adb on PATH) and want to control an Amazon Fire TV through raw ADB commands instead of the dedicated firetv MCP server. Covers connecting, the observe-act loop, seeing the screen (screencap + the uiautomator text trick), D-pad/media/text input, launching apps via intents, and surfacing screenshots through webshell's file tools.
---

You are controlling an Amazon Fire TV by issuing **`adb` commands through the
webshell sandbox's `execute_command`** — reproducing what the dedicated firetv
MCP server does, but by hand. This pairs two skills' worth of discipline: the
**WebShell Operator** rules (each `execute_command` is its own shell; chain with
`&&`, persist state to a sourced file) and the **Fire TV** rules (no touch, no
coordinates — you move a focus highlight with the D-pad, and you **look, make
one move, look again**). Most failures are acting blind or losing track of
focus.

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
