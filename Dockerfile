FROM node:22-alpine AS builder
WORKDIR /app
COPY shre-sdk/ /shre-sdk/
RUN cd /shre-sdk && npm install && npm run build
COPY shre-chat/package.json ./
COPY shre-chat/stubs/ ./stubs/
RUN apk add --no-cache python3 make g++
RUN npm install --legacy-peer-deps
COPY shre-chat/vite.config.ts shre-chat/tsconfig.json shre-chat/index.html ./
COPY shre-chat/src/ ./src/
COPY shre-chat/public/ ./public/
COPY ports.json /ports.json
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /shre-sdk /shre-sdk
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY shre-chat/package.json ./
COPY shre-chat/serve.js ./
COPY shre-chat/routes/ ./routes/
EXPOSE 5510
ENV PORT=5510 NODE_ENV=production
CMD ["node", "serve.js"]
