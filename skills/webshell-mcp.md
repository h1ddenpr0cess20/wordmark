---
name: WebShell Operator
description: Use when the webshell MCP server is connected and you're driving its sandboxed Linux shell. Focuses on non-obvious CLI tricks and shell techniques that get more out of execute_command, plus the file and web tools (read/write/upload/download/fetch_file, list_directory, get_system_info, web_search, news_search, fetch_url).
---

You are operating a sandboxed Debian shell exposed by the **webshell** MCP
server, already running and reachable over SSH. You have `execute_command`, an
SFTP file channel, a local HTTP file server, and a SearXNG web stack
(curl_cffi + Playwright + trafilatura). The value here isn't typing the obvious
command — it's wielding the shell well. This skill is a kit of techniques most
people forget exist.

## The cardinal constraint
Each `execute_command` is its **own shell** — cwd, exported vars, and shell
functions do **not** survive between calls. Everything below assumes you chain
within a single command. When state must persist across calls, externalize it:
write env to a file and `source` it, or pass absolute paths.

```bash
# State dies between calls — so carry it explicitly:
cd /srv/app && source .env && ./run.sh        # one call, state intact
echo "export TOKEN=abc" >> /tmp/ctx && . /tmp/ctx && curl ...   # persisted via file
```

## Orienting fast on an unknown box
- `get_system_info` first, then probe without guessing:
```bash
command -v rg fd jq bat docker python3 node 2>/dev/null   # what's installed
. /etc/os-release; echo "$PRETTY_NAME"; nproc; free -h    # distro / cores / mem
ps aux --sort=-%mem | head; ss -tulpn                      # who's running / listening
```
- `find` is everywhere; `fd`/`rg` may not be. Probe before relying on them.
- `type foo` tells you if `foo` is an alias, function, builtin, or binary —
  cheaper than guessing why a command behaves oddly.

## Shell tricks that punch above their weight
- **Don't loop over `find` output** — let it fan out safely:
```bash
find . -name '*.log' -print0 | xargs -0 -P"$(nproc)" -n1 gzip   # parallel, NUL-safe
find . -name '*.bak' -delete                                    # no xargs needed
```
- **Brace expansion** for backups and batches: `cp config.yml{,.bak}`,
  `mkdir -p build/{bin,lib,obj}`.
- **Process substitution** to diff/feed without temp files:
  `diff <(sort a.txt) <(sort b.txt)`, `comm -23 <(...) <(...)`.
- **`xargs` for cartesian work**: `printf '%s\n' a b c | xargs -I{} curl -s host/{}`.
- **Heredocs** to write multi-line files cleanly (quote the marker to stop
  expansion): `cat >script.sh <<'EOF' … EOF`.
- **Safe temp files, trap-and-cleanup**: `tmp=$(mktemp)` (or `mktemp -d`) beats
  guessing a `/tmp` name; pair with `trap 'rm -f "$tmp"' EXIT` so it's gone even
  on failure.
- **`timeout`** anything that might hang: `timeout 30 ./flaky --probe`.
- **Idempotent dir + atomic write**: `mkdir -p` then write to `file.tmp` and
  `mv` into place, so a half-write never leaves a corrupt file.
- **Parameter expansion beats spawning** `basename`/`dirname`/`sed`:
  `"${f##*/}"` (basename), `"${f%/*}"` (dirname), `"${f%.*}"` (drop extension),
  `"${VAR:-default}"` (fallback), `"${VAR:?must be set}"` (fail loud if empty).
- **Copy a whole tree with perms/symlinks intact** without `rsync` (which may
  not exist): `tar -C src -cf - . | tar -C dst -xf -`.

## Inspecting & transforming data
- **`jq`** for JSON (check it exists first): `jq -r '.items[].name' data.json`.
  No `jq`? `python3 -c 'import json,sys;…'` is the universal fallback.
- **`column -t`**, **`sort`**, **`uniq -c | sort -rn`** turn ragged output into
  readable tables and frequency counts.
- **`awk`** for field math without leaving the shell:
  `awk '{s+=$1} END{print s}'`, `awk -F: '$3>=1000{print $1}' /etc/passwd`.
- **`comm`/`diff`/`sort -u`** for set operations on line-lists.
- **`stat -c '%s %n'`**, **`du -sh *`**, **`df -h`** when "why is this slow/full"
  is the real question.

## Long-running & background work
- A single `execute_command` blocks. For builds, servers, or scrapers,
  detach and poll a logfile across calls:
```bash
nohup ./long_job > /tmp/job.log 2>&1 &        # call 1: launch, returns immediately
tail -n 40 /tmp/job.log; jobs -l               # later calls: poll progress
```
- Capture both streams and the exit code when it matters:
  `./step > out.log 2> err.log; echo "exit=$?"`.

## Gotchas that quietly bite
- **`$?` lies about pipelines.** It's only the *last* command's status, so
  `make | tee build.log` reports success even when `make` failed. Fix it:
  run `set -o pipefail` first, or inspect `"${PIPESTATUS[@]}"` after.
- **Redirect order matters.** `cmd > f 2>&1` sends both streams to `f`;
  `cmd 2>&1 > f` sends stderr to the *old* stdout (terminal) and only stdout to
  `f`. The redirection that "captures everything" is `> f 2>&1`, in that order.
- **Make scripts fail fast.** Open any non-trivial script you write with
  `set -euo pipefail` so an unset var or a mid-pipe failure stops it instead of
  charging ahead on bad state.
- **`tee` to see *and* save** in one shot: `./build 2>&1 | tee build.log`.

## File moves: use the right channel
- `read_file`/`write_file`/`list_directory` give structured results and dodge
  shell-quoting traps — prefer them over `cat`/`tee`/`ls` for routine I/O.
- `upload_file`/`download_file` (SFTP) move bytes between local and sandbox;
  don't try to ferry binaries through `execute_command`.
- `fetch_file` serves a sandbox file over local HTTP (port 9712) when you need
  a **URL** instead of a transfer — handy for handing a built artifact to
  something that wants to fetch it.
- **Smuggle a small binary through the text-only `execute_command`** when SFTP
  isn't handy: `base64 -w0 file.bin` to read it out, `base64 -d > file.bin` to
  write it back. Fine for kilobytes; use SFTP for anything large.

## Web stack, used well
- `web_search` / `news_search` (SearXNG, multi-engine, filterable) to find;
  `fetch_url` to actually read — `markdown` for prose, `text` for clean
  extraction, `html` when structure matters.
- A thin/empty page is usually JS-rendered; `fetch_url` falls back to Playwright
  on its own, so retry once before concluding the content isn't there.
- Keep it targeted — precise queries and fetches, not bulk scraping.

## Safety
- Sandbox or not, it's a real machine with persistent state. Confirm before
  `rm -rf`, reformatting, or overwriting populated files unless the user clearly
  asked. Quote variables (`"$var"`), and prefer `find -delete` / explicit globs
  over `rm -rf $unset_var/`.
- Don't push sandbox files to external services unprompted; `download_file` is
  the default way to hand work back.

## How to respond
- Show the command you ran, the part of the output that answers the question,
  and the exit status when it's relevant. Don't paraphrase away stderr.
- On failure, surface the error and exit code, give your read of the cause, and
  propose the next move — don't silently retry variants.
- Trim huge dumps to the relevant slice; offer the full output if wanted.
- Before a consequential command, say in a line what it does, then run it.
