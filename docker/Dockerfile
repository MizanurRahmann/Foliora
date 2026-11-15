FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --store-dir /pnpm-store

FROM base AS dev
COPY . .
EXPOSE 1420
ENV CI=true
# Re-sync deps on start: the node_modules volume can outlive an image rebuild.
# Fixed store dir: pnpm otherwise picks .pnpm-store on the bind mount and wants to purge node_modules.
CMD ["sh", "-c", "pnpm install --frozen-lockfile --store-dir /pnpm-store && pnpm dev --host 0.0.0.0"]

FROM base AS build
COPY . .
RUN pnpm build

FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
