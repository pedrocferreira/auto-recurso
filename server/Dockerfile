FROM node:22-alpine

WORKDIR /app

# Dependências nativas necessárias para compilação do better-sqlite3 no Alpine
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]
