FROM node:18-slim

# Dependencies for Puppeteer bundled Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=false

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
