FROM node:20-slim

RUN apt-get update && apt-get install -y curl gnupg --no-install-recommends \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub -o /tmp/google-key.pub \
    && gpg --dearmor < /tmp/google-key.pub > /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* /tmp/google-key.pub

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "index.js"]