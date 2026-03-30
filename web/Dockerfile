FROM oven/bun:latest AS builder

WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3211
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3211/ws
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3211
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3211/ws
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["bun", "run", "start"]
