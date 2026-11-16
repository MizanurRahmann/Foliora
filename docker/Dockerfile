FROM node:22-alpine AS web
WORKDIR /app
RUN npm install -g pnpm@10
ENV CI=true
EXPOSE 1420
# Fixed store dir: pnpm otherwise picks .pnpm-store on the bind mount and wants to purge node_modules.
CMD ["sh", "-c", "pnpm install --frozen-lockfile --store-dir /pnpm-store && pnpm dev --host 0.0.0.0"]

FROM node:22-bookworm AS tauri
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl wget file pkg-config \
        libwebkit2gtk-4.1-dev libsoup-3.0-dev libssl-dev libxdo-dev \
        libayatana-appindicator3-dev librsvg2-dev \
        libgl1-mesa-dri libegl1 fonts-dejavu-core dbus-x11 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10 \
    && mkdir -p /app/node_modules && chown -R node:node /app

USER node
ENV HOME=/home/node \
    CARGO_HOME=/home/node/.cargo \
    RUSTUP_HOME=/home/node/.rustup \
    CARGO_TARGET_DIR=/home/node/target \
    PATH=/home/node/.cargo/bin:$PATH \
    CI=true \
    GDK_BACKEND=x11 \
    WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
# The sandbox variable is needed because Docker's default seccomp profile blocks WebKit's bubblewrap sandbox. Dev container only.

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal

# Pre-created so the named volumes mounted here are owned by `node`.
RUN mkdir -p /home/node/.cargo/registry /home/node/.cargo/git /home/node/target \
        /home/node/.pnpm-store /home/node/.local/share/com.mizanur.foliora

WORKDIR /app
CMD ["sh", "-c", "pnpm install --frozen-lockfile --store-dir /home/node/.pnpm-store && pnpm tauri dev"]
