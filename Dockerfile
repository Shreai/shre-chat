FROM node:22-alpine AS builder
WORKDIR /app
COPY shre-sdk/ /shre-sdk/
RUN cd /shre-sdk && npm ci && npm run build
COPY shre-chat/package*.json ./
RUN npm ci || npm install
COPY shre-chat/tsconfig.json shre-chat/vite.config.ts ./
COPY shre-chat/src/ ./src/
COPY shre-chat/public/ ./public/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /shre-sdk /shre-sdk
COPY shre-chat/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY shre-chat/serve.js ./
EXPOSE 5510
ENV PORT=5510 NODE_ENV=production
CMD ["node", "serve.js"]
