export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32 || secret === "dev-only-change-me" || secret === "replace-with-a-long-random-string") {
    throw new Error("SESSION_SECRET production-ში უნდა იყოს მინიმუმ 32 სიმბოლო");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL არ არის დაყენებული");
  }
  if (process.env.SEED_DEMO === "true") {
    throw new Error("SEED_DEMO production-ში არ ირთვება");
  }
}
