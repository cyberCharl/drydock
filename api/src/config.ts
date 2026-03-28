const parsePort = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const config = {
  apiPort: parsePort(process.env.API_PORT, 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://drydock:drydock@localhost:5432/drydock",
};
