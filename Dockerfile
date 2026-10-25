# Multi-stage Dockerfile for ShipShield Control Plane & Isolated Worker
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# --- Stage 1: Build Packages and Applications ---
FROM base AS builder
WORKDIR /app
ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/scan-core/package.json ./packages/scan-core/
COPY packages/scanner-adapters/package.json ./packages/scanner-adapters/
COPY apps/cli/package.json ./apps/cli/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/

RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# --- Stage 2: Production API Control Plane ---
FROM base AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/scan-core/package.json ./packages/scan-core/
COPY apps/api/package.json ./apps/api/

RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=builder /app/packages/scan-core/dist ./packages/scan-core/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

# --- Stage 3: Isolated Worker with Security Scanners ---
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production

# Install security scanner tools and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Gitleaks
RUN curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz | tar -xz -C /usr/local/bin gitleaks

# Install Trivy
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.76.1

# Install Checkov
RUN pip3 install --no-cache-dir checkov --break-system-packages

COPY package*.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/scan-core/package.json ./packages/scan-core/
COPY packages/scanner-adapters/package.json ./packages/scanner-adapters/
COPY apps/worker/package.json ./apps/worker/

RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=builder /app/packages/scan-core/dist ./packages/scan-core/dist
COPY --from=builder /app/packages/scanner-adapters/dist ./packages/scanner-adapters/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Run as non-root user
USER node
CMD ["node", "apps/worker/dist/worker.js"]
