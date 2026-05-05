FROM node:20-slim

# Install Chromium and its dependencies for puppeteer/whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libdrm2 \
    libgbm1 \
    fonts-liberation \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
