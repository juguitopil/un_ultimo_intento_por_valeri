FROM node:18-slim

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
