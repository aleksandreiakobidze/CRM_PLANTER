import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { planterDb?: PrismaClient };

function createAdapter(connectionString: string) {
  if (connectionString.startsWith("mysql")) {
    const { PrismaMariaDb } = require("@prisma/adapter-mariadb") as typeof import("@prisma/adapter-mariadb");
    return new PrismaMariaDb(connectionString);
  }
  return new PrismaPg({ connectionString });
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.planterDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL არ არის დაყენებული");
    }
    globalForPrisma.planterDb = new PrismaClient({ adapter: createAdapter(connectionString) });
  }
  return globalForPrisma.planterDb;
}

export type DbClient = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function isMysql() {
  return (process.env.DATABASE_URL ?? "").startsWith("mysql");
}

/** Case-insensitive contains. MySQL collation already ignores case, so `mode` is omitted there. */
export function contains(value: string) {
  return (isMysql() ? { contains: value } : { contains: value, mode: "insensitive" as const }) as {
    contains: string;
    mode?: "insensitive";
  };
}

export function equalsInsensitive(value: string) {
  return (isMysql() ? { equals: value } : { equals: value, mode: "insensitive" as const }) as {
    equals: string;
    mode?: "insensitive";
  };
}
