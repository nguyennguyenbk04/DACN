FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip \
    && pip3 install yt-dlp --break-system-packages \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 4000
CMD ["node", "src/index.js"]
