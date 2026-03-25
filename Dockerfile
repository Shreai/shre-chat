FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY tsconfig.json vite.config.ts ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY serve.js ./
EXPOSE 5510
ENV PORT=5510 NODE_ENV=production
# NOTE: shre-sdk must be provided as volume or copied in at deploy time
CMD ["node", "serve.js"]
