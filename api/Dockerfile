FROM oven/bun:latest

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
