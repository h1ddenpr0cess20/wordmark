# Docker & Containers

This guide covers running Wordmark in a container. The app is a pure client‑side SPA (static files) — the container only serves the site with Nginx. All API calls happen from your browser directly to the OpenAI endpoint you configure or a local LM Studio server, not from inside the container.

## Images and Files
- Base image: `nginx:alpine`
- App root in container: `/usr/share/nginx/html`
- Default config: `docker/nginx.conf` (HTTP)
- Optional HTTPS config: `docker/nginx-ssl.conf` (mount at runtime)

## Build
```bash
# Important: include the build context '.' at the end
docker build -t wordmark:latest .

# If Docker defaults to Buildx
docker buildx build -t wordmark:latest --load .
```

## Run (Docker)
- HTTP (localhost:8080 → container:80)
```bash
docker run --rm -p 8080:80 wordmark:latest
# Open http://localhost:8080
```

- HTTPS (self‑signed or your certs)
```bash
# Use provided nginx-ssl.conf and mount certs
# Assumes cert.pem and key.pem live in repo root

docker run --rm \
  -p 8443:443 -p 8080:80 \
  -v $(pwd)/docker/nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro \
  -v $(pwd)/cert.pem:/etc/nginx/certs/cert.pem:ro \
  -v $(pwd)/key.pem:/etc/nginx/certs/key.pem:ro \
  wordmark:latest
# Open https://localhost:8443
```

Generate a local self‑signed cert if you need one:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

## Run (Docker Compose)
- HTTP:
```bash
docker compose up --build web
# Open http://localhost:8080
```

- HTTPS profile:
```bash
docker compose --profile ssl up --build web-ssl
# Open https://localhost:8443
```

## Customization
- Nginx config: copy and edit `docker/nginx.conf` or `docker/nginx-ssl.conf`, then mount your version to `/etc/nginx/conf.d/default.conf`.
- Caching: current config caches static assets for 7 days. Adjust `expires` headers if you prefer shorter/longer.
- SPA routing: `try_files $uri $uri/ /index.html;` ensures deep links work.
- Healthcheck: Dockerfile includes a simple `/` GET check.

## Networking Notes
- Requests to AI providers originate from your browser, not from the container. The container is only a static file server.
- CSP in `index.html` already allows `connect-src` to `https:` and `http://localhost:*` plus `ws(s)://localhost:*` for local services.
- Local backends like LM Studio (default `http://localhost:1234`) work when accessed by the browser on the same machine.

## Production Tips
- Prefer a real reverse proxy (Caddy, Traefik, Nginx) to terminate TLS and serve static assets.
- Provide valid certificates (Let’s Encrypt or equivalent) and enable HTTP/2.
- Consider longer cache lifetimes only if you implement asset hashing; current filenames are not hashed.
- Keep `X-Content-Type-Options`, `Referrer-Policy`, and similar headers; CSP is set in `index.html`.

## Troubleshooting
- Buildx error: “requires 1 argument” → add the build context `.` at the end.
- Blank page or blocked requests: check the browser console for CSP violations; default CSP allows `https:` and local `localhost` ports.
- 404 on deep links: ensure the Nginx config contains the SPA fallback `try_files ... /index.html`.
- HTTPS not working: verify cert/key mounts and file permissions; with Compose, ensure `--profile ssl` is enabled.
- Port already in use: change host ports (`-p 8081:80`, `-p 8444:443`) or stop the conflicting service.

