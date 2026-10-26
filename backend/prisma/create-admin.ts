
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/auth/password.js";
import { Role } from "../src/generated/prisma/enums.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from .env.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const rl = createInterface({ input, output });

async function main() {
  const fullName = (await rl.question("Administrator full name: ")).trim();
  const email = (await rl.question("Administrator email: ")).trim().toLowerCase();
  const phone = (await rl.question("Administrator phone (optional): ")).trim();
  const password = await rl.question("Administrator password (minimum 12 characters): ");

  if (!fullName || !email || password.length < 12) {
    throw new Error("Name and email are required; password must be at least 12 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (existingAdmin) {
    throw new Error("An administrator already exists. Setup cancelled.");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        ...(phone ? [{ phone }] : []),
      ],
    },
  });

  if (existingUser) {
    throw new Error("That email or phone number is already registered.");
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      fullName,
      email,
      phone: phone || null,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log("Administrator created successfully.");
}

main()
  .catch((error) => {
    console.error("Administrator setup failed:", error.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
