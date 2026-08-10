import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
	connectionString,
	max: 2,
	idleTimeoutMillis: 10_000,
	allowExitOnIdle: true,
	ssl: connectionString?.includes("localhost") ? false : { rejectUnauthorized: false },
});
const globalDatabase = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
	globalDatabase.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });
if (process.env.NODE_ENV !== "production") globalDatabase.prisma = prisma;
