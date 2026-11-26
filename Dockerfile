# ---------- build stage ----------
FROM node:26-alpine AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# ---------- runtime stage ----------
FROM node:26-alpine
WORKDIR /app

# OS packages refresh so the image scan sees patched Alpine libraries
RUN echo "os-refresh 2026-11-26" && apk upgrade --no-cache

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Kolkata \
    DATA_DIR=/app/data

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
