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
4. Run `npm install`, then smoke test in a browser:
   - `npm run dev` (port 3000), or `npm run dev:https` for a secure context (some APIs/TTS/geolocation require HTTPS).
   - The app is built with Vite — opening `index.html` from the filesystem will not work.
5. Run the checks before opening a PR: `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
6. Open a pull request describing:
   - The bug and steps to reproduce
   - The minimal fix you applied
   - Any notes on limitations or follow-ups

## Coding Style
- TypeScript (strict), 2-space indent, semicolons, **double quotes** (enforced by ESLint — run `npm run lint`).
- Naming: files `camelCase.ts`; folders lowercase.
- Pure ES modules — use explicit `import`/`export`. There are no `window.*` app globals; shared state lives in `src/ts/init/state.ts`. Prefer small modules under `src/ts/**`.
- HTML/CSS: semantic class names; colocate component styles under `src/css/components/**`.
- Don’t commit secrets. New runtime dependencies should be discussed first.
- When adding tools/services, gate features behind settings and sanitize rendered content.

## Tests
- The project has an automated suite (`node:test`). Run it with `npm test`, and `npm run lint` for style. Add or update specs under `tests/*.spec.ts` for any behavior you change, and still do a manual browser smoke test (send a message, tool call, theme switch, history load).

## Maintainer Notes
- Maintainers may close off-topic or out-of-scope PRs/issues to keep focus on learning and code quality.

If you found a bug and can fix it—great. Open a PR. Otherwise, please file concise, actionable issues only when they relate to concrete technical problems.

