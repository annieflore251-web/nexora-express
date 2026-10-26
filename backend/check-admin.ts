
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: {
      fullName: true,
      email: true,
      phone: true,
      isActive: true,
    },
  });

  console.log("Administrators found:", admins);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
