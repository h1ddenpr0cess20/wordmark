# syntax=docker/dockerfile:1

# --- Build stage: compile the Vite bundle ---
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first (reproducible install from the lockfile)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the sources Vite needs and produce the static bundle in /app/dist
COPY vite.config.ts tsconfig.json index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# --- Runtime stage: serve the built static files with Nginx ---
FROM nginx:1.28-alpine-slim

# Install curl for health checks and ensure cert directory exists for SSL mounts
RUN apk add --no-cache curl && \
    mkdir -p /etc/nginx/certs

# Copy our nginx site config (SPA routing + caching + gzip)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built application (static site) from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Healthcheck for basic availability
HEALTHCHECK --interval=300s --timeout=5s --start-period=30s \
  CMD curl -f http://127.0.0.1/ || exit 1

# Run nginx in the foreground (container default)
CMD ["nginx", "-g", "daemon off;"]
