# Build context = services
FROM node:22-slim
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/transfer-service ./apps/transfer-service

RUN npm install \
  && npm run build -w @sea-bank/common \
  && npm run build -w @sea-bank/transfer-service

ENV NODE_ENV=production
ENV SERVICE_NAME=transfer-service
EXPOSE 8083
CMD ["node", "apps/transfer-service/dist/index.js"]
