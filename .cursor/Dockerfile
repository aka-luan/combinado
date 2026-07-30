# System tools only — Cursor checks out the repo separately; do not COPY the app.
# Node >= 22.18 strips types by default (needed for `pnpm test:unit`).
FROM node:22.22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    curl \
  && rm -rf /var/lib/apt/lists/*
