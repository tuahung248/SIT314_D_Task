FROM node:20-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src/ ./src/

USER node

CMD ["node", "src/index.js"]
