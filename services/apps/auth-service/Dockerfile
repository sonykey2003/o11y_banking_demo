# Build context = services  (so the workspace + @sea-bank/common resolve).
FROM node:22-slim
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/auth-service ./apps/auth-service

RUN npm install \
  && npm run build -w @sea-bank/common \
  && npm run build -w @sea-bank/auth-service

ENV NODE_ENV=production
ENV SERVICE_NAME=auth-service
EXPOSE 8081
CMD ["node", "apps/auth-service/dist/index.js"]
