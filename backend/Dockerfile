# backend/Dockerfile
FROM node:20-alpine

# Install OS deps (needed by pg / Prisma)
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies. Copy package manifests and Prisma schema first so
# postinstall can run `prisma generate` successfully inside the container.
COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .

# Build TypeScript
RUN npm run build

# Expose backend port (matches PORT env)
EXPOSE 3001

CMD ["npm", "run", "start"]