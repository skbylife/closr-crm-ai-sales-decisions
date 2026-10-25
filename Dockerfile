FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL=http://localhost:5432
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key
ARG NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=postgres
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=$NEXT_PUBLIC_CLOSR_DATABASE_BACKEND
ENV CLOSR_DATABASE_BACKEND=$NEXT_PUBLIC_CLOSR_DATABASE_BACKEND
COPY . .
# Keep dependency installation and cleanup in one layer. This avoids retaining
# development dependencies or duplicating them on VFS Docker storage drivers.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci && npm cache clean --force && npm run build && \
    rm -rf node_modules .next/cache

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Next's traced standalone runtime avoids a second complete dependency install.
# Static assets and operator migration/recovery tools are not auto-copied by Next.
RUN --mount=from=builder,source=/app,target=/build,ro \
    cp -a /build/.next/standalone/. /app/ && \
    cp -a /build/public /build/scripts /build/database /build/data /app/ && \
    cp -a /build/.next/static /app/.next/static && \
    mkdir -p /app/src/lib/native-auth /data/closr && \
    cp /build/src/lib/native-auth/recovery-cli.mjs /app/src/lib/native-auth/ && \
    chown -R node:node /app /data/closr
USER node
EXPOSE 3000
CMD ["node", "server.js"]
