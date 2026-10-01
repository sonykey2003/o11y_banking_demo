# Build context = services
FROM node:22-slim
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/account-service ./apps/account-service

RUN npm install \
  && npm run build -w @sea-bank/common \
  && npm run build -w @sea-bank/account-service

ENV NODE_ENV=production
ENV SERVICE_NAME=account-service
EXPOSE 8082
CMD ["node", "apps/account-service/dist/index.js"]
