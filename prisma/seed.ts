import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const mobile = process.env.SEED_ADMIN_MOBILE || "09120000000";

  await prisma.admin.upsert({
    where: { mobile },
    update: { active: true },
    create: {
      name: "مدیر سامانه",
      mobile,
      role: UserRole.SUPER_ADMIN,
      active: true,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
