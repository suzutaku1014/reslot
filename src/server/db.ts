import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma";

const configuredUrl = process.env.DATABASE_URL;
const localDatabase = configuredUrl?.includes("localhost") ?? false;
const connectionString = localDatabase
	? configuredUrl
	: configuredUrl?.replace("sslmode=require", "sslmode=verify-full");
const pool = new Pool({
	connectionString,
	max: 2,
	idleTimeoutMillis: 10_000,
	allowExitOnIdle: true,
	ssl: localDatabase ? false : { rejectUnauthorized: true },
});
const globalDatabase = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
	globalDatabase.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });
if (process.env.NODE_ENV !== "production") globalDatabase.prisma = prisma;
