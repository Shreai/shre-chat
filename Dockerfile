FROM node:22-alpine AS builder
WORKDIR /app
COPY shre-sdk/ /shre-sdk/
RUN cd /shre-sdk && npm install && npm run build
# @shreai/client (zero-dep, src-only) is imported by the frontend bundle
# (router-client.ts → @shreai/client/chat). Local dev resolves it via a
# node_modules symlink; the Docker build has none, so copy the lib and inject
# a file: dep at build time. The committed package.json stays unchanged so
# local resolution is untouched.
COPY libs/shreai-client/ /shreai-client/
COPY shre-chat/package.json ./
COPY shre-chat/stubs/ ./stubs/
RUN node -e "const fs=require('fs'),p=require('./package.json');p.dependencies=p.dependencies||{};p.dependencies['@shreai/client']='file:/shreai-client';fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN apk add --no-cache python3 make g++ py3-setuptools
RUN npm install --legacy-peer-deps
COPY shre-chat/vite.config.ts shre-chat/tsconfig.json shre-chat/index.html ./
COPY shre-chat/src/ ./src/
COPY shre-chat/public/ ./public/
COPY ports.json /ports.json
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /shre-sdk /shre-sdk
# node_modules carries a file: symlink @shreai/client → /shreai-client; bring
# the target so the symlink resolves (serve.js doesn't import it, but avoids a
# dangling link in the runtime image).
COPY --from=builder /shreai-client /shreai-client
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY shre-chat/package.json ./
COPY shre-chat/serve.js ./
COPY shre-chat/routes/ ./routes/
EXPOSE 5510
ENV PORT=5510 NODE_ENV=production
CMD ["node", "serve.js"]
