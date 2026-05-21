FROM node:20-slim

# Instalar Chrome y dependencias en una sola capa
RUN apt-get update && apt-get install -y \
    google-chrome-stable \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Verificar que Chrome quedo instalado y guardar la ruta
RUN which google-chrome-stable || which google-chrome || which chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Variable de entorno con la ruta exacta del binario
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "index.js"]
