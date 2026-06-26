---
name: WebShell Dev Environment
description: Use when the webshell MCP server is connected and you're using its sandbox as a real development box — cloning repos, installing dependencies, building, running tests, starting dev servers, debugging code, and driving git. Companion to the WebShell Operator skill (which covers general shell tricks); this one is the build/test/run loop.
---

You are using the **webshell** MCP server's sandbox as a development machine. It
is a persistent Debian box reached over SSH (Playwright, Python, and common
toolchains available), driven through `execute_command` plus the file tools
(`read_file`/`write_file`/`list_directory`, `upload_file`/`download_file`,
`fetch_file`) and the web stack (`web_search`/`fetch_url`). Treat it like a
checkout you own: set it up deliberately, work in tight feedback loops, and
leave it in a known state.

Remember the cardinal constraint from the Operator skill: **each
`execute_command` is its own shell** — cwd and exported env do not persist. Pin
a project root and reuse it explicitly: `cd "$REPO" && <cmd>`, or write env to a
file you `source`.

## Set up the workspace
- Probe the toolchain before assuming it: `command -v git node python3 go cargo
  rustc java mvn docker make 2>/dev/null`, and check versions (`node -v`,
  `python3 -V`) against what the project's manifests pin (`.nvmrc`,
  `.python-version`, `engines` in `package.json`, `go.mod`, `rust-toolchain`).
- Clone shallow when you only need the tip: `git clone --depth 1 <url> "$REPO"`.
  For a repo already present, `git -C "$REPO" pull --ff-only`.
- Install dependencies the way the project expects, and respect the lockfile:
  - Node: `npm ci` (not `npm install`) when `package-lock.json` exists; `pnpm i
    --frozen-lockfile` / `yarn --immutable` for those ecosystems.
  - Python: prefer a venv — `python3 -m venv .venv && . .venv/bin/activate &&
    pip install -r requirements.txt` (or `pip install -e .`). The activate must
    happen in the same call as the install/run.
  - Go: `go mod download`. Rust: `cargo fetch`. Java: `mvn -q install`.

## The inner loop: build, test, run
- **Read the project's own scripts first** — don't invent commands. Check
  `package.json` `scripts`, a `Makefile`, `justfile`, `tox.ini`, `noxfile.py`,
  `CONTRIBUTING.md`, or CI config (`.github/workflows`). The canonical
  build/test/lint commands are almost always already defined there.
- **Run the narrowest test that proves your change**, then widen. Most runners
  take a filter:
  - `pytest path/to/test_x.py::test_case -q`, `pytest -k 'name and not slow'`
  - `npm test -- <file>` / `vitest run <file>` / `jest -t 'case name'`
  - `go test ./pkg -run TestName`, `cargo test name_substr`
- **Tee test output** so you keep the full log while reading the tail:
  `npm test 2>&1 | tee /tmp/test.log; echo "exit=${PIPESTATUS[0]}"`. (Bare `$?`
  reports `tee`, not the test runner.)
- **Lint and typecheck** before declaring done: `eslint .`, `ruff check`,
  `mypy`, `tsc --noEmit`, `go vet`, `cargo clippy` — whichever the repo uses.
- Re-run the **exact** failing command after a fix; don't broaden scope until it
  goes green, then run the full suite once to catch collateral damage.

## Dev servers & anything long-running
- A foreground server blocks `execute_command`. Background it and poll the log:
```bash
cd "$REPO" && nohup npm run dev > /tmp/dev.log 2>&1 & echo "pid=$!"
sleep 1; tail -n 30 /tmp/dev.log        # confirm it actually booted
```
- Confirm it's up before driving it: `curl -fsS -o /dev/null -w '%{http_code}\n'
  http://127.0.0.1:3000` or `ss -tulpn | grep :3000`.
- Stop it cleanly when done — `kill "$pid"` (the PID you captured), or
  `pkill -f 'npm run dev'`. Don't leave orphaned servers holding ports between
  tasks.
- For a built artifact or a running preview you want to hand off, `fetch_file`
  exposes it over local HTTP (port 9712); `download_file` pulls a file back to
  the local machine.

## Services, containers & environment
- The box has **Docker** — spin up test dependencies (Postgres, Redis, etc.)
  with the repo's `docker compose up -d`, or `docker run -d`, and verify with
  `docker ps` before assuming a service is listening. Tear them down when done
  (`docker compose down`) so nothing lingers between tasks.
- When the host toolchain mismatches what the repo needs, **build/run in the
  container** the repo ships: `docker build -t app . && docker run --rm app`.
- Pass config via **env in the same call** (`DATABASE_URL=... npm test`) or a
  sourced `.env` — remember env doesn't persist across `execute_command` calls.
  Never bake secrets into files you might commit; keep them in env or an
  ignored `.env`.

## Editing code
- Use `read_file`/`write_file` for whole-file reads and rewrites — structured
  and quote-safe. For surgical in-place edits, `sed -i.bak 's/.../.../'` or a
  patch: `git -C "$REPO" apply <<'PATCH' … PATCH`.
- Match the codebase: skim neighbors for style, imports, and existing helpers
  before adding code. Run the formatter the repo ships (`prettier -w`, `black`,
  `gofmt -w`, `cargo fmt`) rather than hand-aligning.
- Keep changes reviewable — don't reformat untouched files or churn whitespace.

## Debugging a failure
- Reproduce first with the smallest command, then get signal:
  - Verbose/log flags the tool already has (`pytest -x -vv`, `node --trace-warnings`,
    `RUST_BACKTRACE=1`, `make V=1`).
  - `git -C "$REPO" log --oneline -5` and `git diff` to see what actually
    changed; `git bisect` when a regression's origin is unclear.
  - For "what is it even doing", the Operator skill's tools apply: `strace -f`,
    `lsof -p`, `/proc/<pid>/`.
- Pin the cause before patching, and prefer the fix the codebase's conventions
  point to over a quick hack.

## Git hygiene in the sandbox
- Branch for work: `git -C "$REPO" switch -c <branch>`. Inspect with
  `git status` / `git diff --staged` before committing.
- Stage intentionally (`git add -p` is interactive — avoid; stage explicit
  paths instead). Write a clear message via a file or `-m`.
- **Do not push** from the sandbox unless the user asked and credentials are
  set up; surface the diff and let them decide. Never commit secrets, build
  output, or `.env` files — check `git status` for stray artifacts first.

## How to respond
- Show the command, the decisive part of the output, and the real exit status
  (via `PIPESTATUS` when piped). Don't claim green without having run it.
- When tests fail, paste the failing assertion and your read of the cause before
  changing code; after fixing, show the same command passing.
- State what you installed or started and what state you left running (servers,
  branches, uncommitted changes) so nothing dangles silently.
- Lead with correctness and test results over style nits when reviewing.
