# ---- Build stage: installs all deps (inc. build tools for native modules) and compiles TS ----
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev jpeg-dev giflib-dev

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY tsconfig.json .
COPY src ./src
RUN pnpm build

# ---- Runtime stage: same Alpine base so native .node binaries are ABI-compatible ----
FROM node:22-alpine AS runtime

RUN apk add --no-cache pixman cairo pango jpeg giflib

WORKDIR /app
# Copy compiled JS and node_modules (which includes the compiled native .node files)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .

# Mount a host directory here to persist the SQLite database across container restarts
VOLUME /app/data
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
