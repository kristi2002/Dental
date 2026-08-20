# syntax=docker/dockerfile:1

# DentOrganizer — production image.
#
# Four stages: dependencies, the Next.js build, an isolated copy of the Prisma
# CLI (the container syncs its own schema at boot), and a runtime that carries
# only Next's standalone output — ~200 MB rather than the ~1 GB a naive copy of
# node_modules would cost on every deploy.

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
# deps — node_modules alone, so this layer survives every source-only change
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# sharp, Next's image optimiser, expects glibc symbols musl does not provide.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
# Everything `postinstall` reaches for, and nothing else — this stage exists to
# survive source-only changes, so anything copied here costs a full `npm ci`
# whenever it moves.
#
# `prisma generate` needs the config and the schema. `copy-zxing-wasm.mjs` needs
# only to *exist*: it is written never to fail a build, catching every error and
# warning instead — but that defence cannot run when node cannot find the file,
# and a `postinstall` that exits non-zero takes `npm ci` down with it.
#
# Which is exactly what happened. The scanner's WebAssembly staging step joined
# `postinstall` without joining this stage, and every deploy from that commit on
# died here on line 35 with an unexplained `npm ci` exit 1 — while the previous
# image kept serving, so the site simply stopped changing.
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts

# `prisma.config.ts` resolves env('DATABASE_URL') eagerly and throws when it is
# unset, and `npm ci` triggers `postinstall` → `prisma generate`. So generating
# the client needs *a* URL. Kept inline rather than in an ENV so no placeholder
# credential is recorded in the image metadata; nothing ever connects to it.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    npm ci

# ---------------------------------------------------------------------------
# builder — compile the app
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the JavaScript served to the browser.
# They are frozen here and cannot be changed by editing the environment later —
# to point the app at another domain, rebuild with a different --build-arg
# (in Coolify: "Build Variables").
ARG NEXT_PUBLIC_APP_URL="https://dental.testdemo.it"
ARG NEXT_PUBLIC_CLINIC_NAME="Klinika Dentare"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_CLINIC_NAME=${NEXT_PUBLIC_CLINIC_NAME}

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `npm run build` stages the barcode decoder's WebAssembly into `public/` (see
# scripts/copy-zxing-wasm.mjs), but that step is deliberately non-fatal — a
# missing decoder costs Safari and Firefox their camera, which is not worth
# failing a release over. This mkdir is the safety net for exactly that case:
# without it the runtime stage's `COPY /app/public` would have no source and the
# image build would fail for the one reason the copy script refuses to.
#
# Both placeholders are scoped to this one command rather than set as ENV, so
# nothing resembling a credential is recorded in the image metadata:
#   DATABASE_URL — `prisma generate` insists on a syntactically valid URL, but
#                  the build never connects; every route renders on demand.
#   AUTH_SECRET  — `src/lib/auth/token.ts` refuses to load in production without
#                  one. Nothing signs a real cookie during a build.
RUN mkdir -p public \
    && DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
       AUTH_SECRET="build-time-placeholder-never-used-to-sign-anything" \
       npm run build

# ---------------------------------------------------------------------------
# prisma-cli — the CLI on its own, for the schema sync at boot
# ---------------------------------------------------------------------------
# `prisma` is a devDependency and is rightly absent from the runtime's
# node_modules, but the container still has to reconcile its schema before
# serving. Installing it in a separate tree keeps npm away from the standalone
# output, which is a hand-picked subset npm would try to "repair" back to full.
FROM node:${NODE_VERSION} AS prisma-cli
WORKDIR /opt/prisma-cli

COPY package.json ./source-package.json
RUN PRISMA_VERSION="$(node -p "require('./source-package.json').devDependencies.prisma")" \
    && rm source-package.json \
    && npm init -y > /dev/null \
    && npm install --no-audit --no-fund "prisma@${PRISMA_VERSION}"

# The CLI is pointed at this rather than the project's `prisma.config.ts`; the
# file itself explains why.
COPY docker/prisma-deploy.config.mjs ./prisma.config.mjs

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# openssl: the Prisma schema engine links against it.
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Patient files must outlive the container. This is the volume mount point.
ENV FILE_STORAGE_DIR=/data/patient-files

RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=prisma-cli --chown=nextjs:nodejs /opt/prisma-cli /opt/prisma-cli
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# Run once after the first deploy to create the Owner account — without it there
# is no way to sign in to a fresh database. See docs/DEPLOYMENT.md.
COPY --chown=nextjs:nodejs docker/create-owner.mjs ./docker/create-owner.mjs
# Read by the entrypoint before it applies migrations, to tell an empty database
# from one the old `db push` workflow built. Like create-owner.mjs it needs only
# `pg`, which the standalone output already traces.
COPY --chown=nextjs:nodejs docker/check-migration-state.mjs ./docker/check-migration-state.mjs

# The entrypoint is edited on Windows as often as not, and a trailing CR turns
# the shebang into a file that does not exist.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /data/patient-files \
    && chown -R nextjs:nodejs /data

USER nextjs

EXPOSE 3000

# `/api/health` answers only "can I reach my database" — safe to poll, and the
# signal Coolify uses to decide whether a deploy came up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
