# Contributing

Thanks for your interest. This is primarily a solo learning project. That said, small, focused contributions that fix real bugs are welcome.

## What’s Welcome
- Bug fixes with clear reproduction steps.
- Small documentation tweaks that improve accuracy or clarity.

## What’s Not a Fit
- New features or large refactors (unless discussed and agreed in advance).
- Off-topic discussions (political/ideological/social). Keep it technical.

## How to Contribute
1. Fork the repo and create a branch for your fix.
2. Reproduce the issue locally and confirm the root cause.
3. Make a minimal change that fixes the problem without unrelated edits.
4. Manually smoke test in a browser:
   - Open `index.html` directly, or
   - Serve locally (HTTPS recommended for some APIs/TTS):
     - Node: `http-server -S -C cert.pem -K key.pem -p 8000`
     - Python: `python -m http.server 8000 --directory .` (use an HTTPS-capable server when possible)
5. Open a pull request describing:
   - The bug and steps to reproduce
   - The minimal fix you applied
   - Any notes on limitations or follow-ups

## Coding Style
- JavaScript: ES6+, 2-space indent, semicolons, single quotes.
- Naming: files `camelCase.js`; folders lowercase.
- Keep globals on `window.*` (no bundler). Prefer small modules under `src/js/**`.
- HTML/CSS: semantic class names; colocate component styles under `src/css/components/**`.
- Don’t add dependencies or license headers. Don’t commit secrets.
- When adding tools/services, gate features behind settings and sanitize rendered content.

## Tests
- No automated tests are configured; please provide clear repro steps and do a manual browser smoke test (send a message, tool call, theme switch, history load).

## Maintainer Notes
- Maintainers may close off-topic or out-of-scope PRs/issues to keep focus on learning and code quality.

If you found a bug and can fix it—great. Open a PR. Otherwise, please file concise, actionable issues only when they relate to concrete technical problems.

