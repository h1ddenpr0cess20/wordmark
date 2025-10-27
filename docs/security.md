# Security

Sanitization

- DOMPurify is configured in `init/initialization.js` to:
  - Allow standard tags and a minimal, constrained set of `<iframe>` attributes for YouTube embeds only.
  - For images: set `referrerpolicy`, `crossorigin`, and `loading=lazy` on external images; HTTP is upgraded to HTTPS where possible.
  - Forbid script/object/embed/link and event handler attributes.

Content Security Policy

- `index.html` sets a CSP header via meta tag:
  - `default-src 'self'`
  - `connect-src 'self' https: http://localhost:* ws://localhost:* wss://localhost:*`
  - `img-src 'self' data: https: blob:`
  - `style-src 'self' 'unsafe-inline'`
  - `script-src 'self' 'unsafe-inline'`
  - `frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com`
  - `media-src 'self' data: blob: https:`

Keys & Privacy

- API keys are entered in-app and stored in localStorage (never committed to the repo). No analytics or tracking is present.
- Conversations, images, and audio are stored in IndexedDB and never leave your machine unless your configured providers receive data as part of a request.

HTTPS

- Some browser APIs and provider features require HTTPS; use the local HTTPS instructions in the Getting Started guide.

