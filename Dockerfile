# Always-on download worker: Node + yt-dlp + ffmpeg
# Build: docker build -t barq-worker .
# Run:   docker run --rm -p 8080:8080 --env-file worker.env barq-worker
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && ln -sf /usr/bin/ffmpeg /usr/local/bin/ffmpeg \
  && yt-dlp --version \
  && ffmpeg -version | head -1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY scripts ./scripts
COPY migrations ./migrations
COPY src ./src
COPY server ./server

ENV NODE_ENV=production \
    PORT=8080 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    BARQ_REQUIRE_POSTGRES=on

EXPOSE 8080

# Health: GET /healthz  Wake: POST /wake (x-barq-job)
CMD ["npx", "tsx", "src/worker/main.ts"]
