# Build context = services
FROM node:22-slim
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api-gateway ./apps/api-gateway

RUN npm install \
  && npm run build -w @sea-bank/common \
  && npm run build -w @sea-bank/api-gateway

ENV NODE_ENV=production
ENV SERVICE_NAME=api-gateway
EXPOSE 8080
CMD ["node", "apps/api-gateway/dist/index.js"]
