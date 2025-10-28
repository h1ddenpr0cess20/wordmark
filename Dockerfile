# Use a small Nginx image to serve static files
FROM nginx:1.28-alpine-slim

# Install curl for health checks and ensure cert directory exists for SSL mounts
RUN apk add --no-cache curl && \
    mkdir -p /etc/nginx/certs

# Copy our nginx site config (SPA routing + caching + gzip)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the application (static site)
COPY index.html /usr/share/nginx/html/index.html
COPY robots.txt /usr/share/nginx/html/robots.txt
COPY src /usr/share/nginx/html/src

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Healthcheck for basic availability
HEALTHCHECK --interval=300s --timeout=5s --start-period=30s \
  CMD curl -f http://127.0.0.1/ || exit 1

# Run nginx in the foreground (container default)
CMD ["nginx", "-g", "daemon off;"]
