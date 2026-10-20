import "dotenv/config";
import { defineConfig } from "prisma/config";

const mysql = (process.env.DATABASE_URL ?? "").startsWith("mysql");

export default defineConfig({
  schema: mysql ? "prisma/schema.mysql.prisma" : "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
