# ── Frontend Dockerfile (React + Vite → Nginx) ────────────────────────────────
# Multi-stage build: build with Node, serve with Nginx

FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Build-time arg: backend URL injected at image build time
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Production Stage (Nginx) ──────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx config for React Router (SPA routing support)
RUN printf 'server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n  # Security headers\n  add_header X-Frame-Options "SAMEORIGIN";\n  add_header X-Content-Type-Options "nosniff";\n  gzip on;\n  gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ | grep -q '<div' || exit 1

CMD ["nginx", "-g", "daemon off;"]
