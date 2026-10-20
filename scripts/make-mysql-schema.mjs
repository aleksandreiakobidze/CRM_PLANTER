import { readFileSync, writeFileSync } from "fs";

const source = readFileSync("prisma/schema.prisma", "utf8");
const mysql = source
  .replace('provider = "postgresql"', 'provider = "mysql"')
  .replaceAll("@db.Timestamptz(6)", "@db.DateTime(3)")
  .replace("aliases        String[]", "aliases        Json");

writeFileSync("prisma/schema.mysql.prisma", mysql);
console.log("wrote prisma/schema.mysql.prisma");
