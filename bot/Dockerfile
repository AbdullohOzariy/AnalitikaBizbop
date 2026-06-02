FROM node:20-alpine AS miniapp-builder
WORKDIR /app/miniapp
COPY miniapp/package*.json ./
RUN npm ci
COPY miniapp/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=miniapp-builder /app/miniapp/dist ./miniapp/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
