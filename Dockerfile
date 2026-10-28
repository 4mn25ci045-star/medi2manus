FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
