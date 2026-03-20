FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

FROM node:22-alpine

WORKDIR /app

# Install native deps for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/package.json .

# Create mount points
RUN mkdir -p /library /player /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV LIBRARY_PATH=/library
ENV PLAYER_MOUNT_BASE=/player
ENV SCAN_INTERVAL=0

EXPOSE 3000

CMD ["node", "build"]
