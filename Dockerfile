# syntax=docker/dockerfile:1
# Image duy nhất của yft-design: build frontend (Vite) rồi để server Node
# phục vụ cả SPA lẫn API. Dữ liệu (SQLite, ảnh tải lên, sao lưu) nằm ở /data.
ARG NODE_VERSION=22

# ---------- 1. Build frontend ----------
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV CI=true
WORKDIR /app
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---------- 2. Cài dependency của server (có module native) ----------
FROM node:${NODE_VERSION}-bookworm-slim AS server-deps
WORKDIR /app/server
# Chỉ cần ở tầng build: dùng khi better-sqlite3 không có bản dựng sẵn cho nền tảng.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml server/.npmrc ./
RUN pnpm install --frozen-lockfile --prod

# ---------- 3. Image chạy ----------
FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8788 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/migrations ./migrations
COPY server/src ./src
COPY --from=web /app/dist /app/web

# Chạy bằng user thường; /data phải thuộc về user đó trước khi volume được gắn.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
