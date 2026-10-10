FROM node:24-bookworm-slim AS base
WORKDIR /app
FROM base AS deps
COPY package.json package-lock.json ./
COPY scripts/pdf-assets.mjs ./scripts/pdf-assets.mjs
RUN npm ci
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/pdf-assets.mjs && npm run build
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/app/data/uploads
RUN groupadd --system margin && useradd --system --gid margin margin && mkdir -p /app/data/uploads && chown -R margin:margin /app
COPY --from=builder --chown=margin:margin /app/.next/standalone ./
COPY --from=builder --chown=margin:margin /app/.next/static ./.next/static
COPY --from=builder --chown=margin:margin /app/public ./public
USER margin
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
FROM builder AS worker
ENV NODE_ENV=production UPLOAD_DIR=/app/data/uploads
CMD ["npm","run","worker"]
