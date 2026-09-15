FROM node:22-alpine

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PORT=8787
ENV DATABASE_URL=file:/data/samwell-cloud.sqlite

RUN corepack enable
RUN mkdir -p /data

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY packages/samwell-shared/package.json packages/samwell-shared/package.json
COPY server/package.json server/package.json

RUN pnpm install --frozen-lockfile --filter samwell-cloud-server...

COPY packages ./packages
COPY server ./server

RUN pnpm --filter samwell-cloud-server build

ENV NODE_ENV=production

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "--filter", "samwell-cloud-server", "start"]
