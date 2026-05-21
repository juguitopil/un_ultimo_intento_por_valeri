FROM node:20-slim
 
# Agregar el repo oficial de Google Chrome antes de instalar
RUN apt-get update && apt-get install -y wget gnupg --no-install-recommends \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
 
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
 
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production
 
EXPOSE 3000
CMD ["node", "index.js"]
 