# ws-scrcpy — the project is built entirely inside Docker.
# The image is built from THIS local project directory (no git clone).

FROM node:18-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    DEVICE=localhost:5555 \
    PORT=8000 \
    EMBED_URL=http://192.168.41.1:22267/

WORKDIR /ws-scrcpy

# ---- build dependencies (native modules: node-pty, etc.) ----
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        adb \
        tini \
        ca-certificates \
        python3 \
        make \
        g++ && \
    rm -rf /var/lib/apt/lists/*

# ---- copy the local project (see .dockerignore) ----
COPY . .

# ---- install dependencies and build ----
RUN npm install
RUN npm run dist

# ---- entrypoint: run the server only while a device is connected ----
COPY docker/entrypoint.sh /usr/local/bin/wait-for-device.sh
RUN chmod +x /usr/local/bin/wait-for-device.sh

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--", "sh", "/usr/local/bin/wait-for-device.sh"]
