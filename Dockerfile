# Stage 1: Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate 
RUN pnpm build

# Stage 2: Runtime
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

EXPOSE 3000
# Deploy migration trước khi start để đảm bảo schema mới nhất (như Module C3 em vừa làm) [cite: 484, 506]
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm db:seed && pnpm start:prod"]