import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { planterDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.planterDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL არ არის დაყენებული");
    }
    const adapter = new PrismaPg({ connectionString });
    globalForPrisma.planterDb = new PrismaClient({ adapter });
  }
  return globalForPrisma.planterDb;
}

export type DbClient = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
