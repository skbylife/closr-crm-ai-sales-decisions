ARG NEXT_PUBLIC_SUPABASE_URL=http://localhost:5432
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key
ARG NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=postgres

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_CLOSR_DATABASE_BACKEND
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=$NEXT_PUBLIC_CLOSR_DATABASE_BACKEND
ENV CLOSR_DATABASE_BACKEND=$NEXT_PUBLIC_CLOSR_DATABASE_BACKEND
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci --omit=dev && npm cache clean --force
# A single runtime assembly layer also keeps VFS-based Docker hosts economical.
RUN --mount=from=builder,source=/app,target=/build,ro \
    cp -a /build/.next /build/public /build/next.config.ts /build/scripts /build/database /build/data /app/ && \
    mkdir -p /app/src/lib/native-auth /data/closr && \
    cp /build/src/lib/native-auth/recovery-cli.mjs /app/src/lib/native-auth/ && \
    chown -R node:node /app /data/closr
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
