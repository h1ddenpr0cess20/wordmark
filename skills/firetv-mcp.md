---
name: Fire TV Controller
description: Use when the firetv MCP server is connected and you're controlling an Amazon Fire TV — launching apps, navigating menus, searching, playing media, typing into fields. Built around the perception-act loop the device demands, because D-pad-only, focus-based control trips up models that assume touch or coordinates.
---

You are controlling an Amazon Fire TV over ADB through the **firetv** MCP
server. This is **not** a touchscreen and there are **no coordinates** — you
cannot tap or click an element at an (x, y). The only way to reach something is
to move a *focus highlight* around the screen with the D-pad and press select.
Getting this right is mostly discipline, not cleverness: **look, make one move,
look again.** Most failures come from acting blind and losing track of where
focus is.

## The golden rule: observe → one move → observe
The single biggest mistake is firing a batch of D-pad presses without looking,
then having no idea where focus landed. Instead, run a tight loop:
1. **`screenshot`** — see the current screen and, critically, *which element is
   highlighted* (the focused item has a border/glow/scale — find it first).
2. **Decide one step** — the direction and a *small* number of presses to get
   closer to the target.
3. **Act** — `navigate` (one press) or `navigate_repeat` (a counted run).
4. **`screenshot` again** to confirm focus moved where you expected.

Re-check after every move near the target. When unsure where focus is, **don't
guess — screenshot.** A screenshot is cheap; a wrong `select` deep in the wrong
app is expensive to unwind.

## Prefer a direct command over walking the UI
Before D-pad-navigating anywhere, ask "is there a tool that just does this?"
Models waste dozens of presses crossing the home screen when one call jumps
straight there:
- **Open an app** → `launch_app` with a friendly alias (`netflix`, `prime`,
  `disney+`, `youtube`) or package name — **not** by navigating the home row.
  Run `list_app_aliases` / `list_apps` if you're unsure of the name.
- **Open specific content** → `open_url` with a deep link, or `search_content`
  with a query, instead of browsing menus to find it.
- **Play/pause/seek** → `media_control` (and `now_playing` to see state) instead
  of hunting for an on-screen transport bar.
- **Volume / settings / power** → `volume` / `set_volume`, `open_settings`,
  `wake` / `sleep` — dedicated tools, no navigation needed.
- **Confirm you arrived** → `get_current_app` after a launch; `now_playing`
  after starting media. Verify, don't assume.

Reserve D-pad navigation for *within* a screen where no direct tool reaches the
target (picking a tile in a grid, a row in a list, a button in a dialog).

## Navigating a grid or list without overshooting
- Find the highlighted item in the screenshot, then count the **rows/columns**
  between it and the target. Move with intent: `navigate_repeat right 3` beats
  three guesses — but verify with a screenshot after the run.
- **Slow down near the goal.** Single `navigate` presses when you're one or two
  tiles away; overshooting and bouncing back loses your place.
- Watch for **wrap-around and uneven rows** — the last item in a row may wrap to
  the next row, and rows aren't always the same length. If a move didn't land
  where expected, screenshot and re-plan rather than pressing harder.
- **`back`** backs out one level; **`home`** resets to the launcher. When you're
  lost or focus is somewhere unexpected, go `home` and start from a known state
  instead of flailing deeper.

## Typing into fields
- `input_text` types into the **currently focused** input — so focus the search
  box / text field *first* (navigate to it and select to open the keyboard, or
  use `search_content` which lands you in search). Typing with nothing focused
  goes nowhere.
- Fix mistakes with `clear_input` (sends DEL keys) rather than navigating an
  on-screen keyboard backspace.
- After typing, you usually still need to **submit**: `navigate select`, or
  navigate to a result and select. Screenshot to see whether a results list
  appeared.

## Timing and device state
- **The UI is not instant.** App launches, screen transitions, and video starts
  take time. If a screenshot looks mid-animation or blank, the action probably
  hasn't settled — take another screenshot a moment later rather than acting on
  a half-rendered frame.
- **Check the device is awake first.** `get_screen_state`; if it's off, `wake`
  before anything else — commands sent to a sleeping screen appear to do
  nothing.
- ADB commands time out (default ~10s). A timeout means the device was busy or
  unreachable, not that the action definitely failed — screenshot to see the
  real state before retrying.
- `navigate_repeat`'s delay exists because presses fired too fast can be dropped
  by the UI; lean on it for multi-step moves instead of many rapid single
  presses.

## Escape hatch
- `shell` runs an arbitrary ADB command when no dedicated tool fits — useful,
  but prefer the purpose-built tools, which handle key codes and formatting for
  you. Reserve `shell` for genuine gaps.

## How to respond
- Narrate by intent and verified state, not raw key spam: "Launched Netflix
  (confirmed via `get_current_app`), now on the Home rail with focus on the top
  tile." A `screenshot` after key steps is your evidence — use it.
- If you can't tell where focus is from the latest screenshot, say so and take
  another rather than pressing on blind.
- When a direct tool exists for what the user asked, use it and say you did,
  instead of describing a long D-pad route.
- If something didn't work (timeout, focus lost, app didn't open), report what
  the screenshot actually shows and your next step — don't claim success you
  haven't verified.
