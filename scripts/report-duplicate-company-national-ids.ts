import { PrismaClient } from "@prisma/client";
import { keepAsciiDigits } from "@/lib/input/digits";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      companyNationalId: {
        not: null,
      },
    },
    select: {
      id: true,
      mobile: true,
      companyName: true,
      companyNationalId: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const duplicates = new Map<string, typeof users>();

  for (const user of users) {
    const normalizedNationalId = keepAsciiDigits(user.companyNationalId ?? "");

    if (!normalizedNationalId) {
      continue;
    }

    const group = duplicates.get(normalizedNationalId) ?? [];
    group.push(user);
    duplicates.set(normalizedNationalId, group);
  }

  const repeatedGroups = [...duplicates.entries()].filter(([, group]) => group.length > 1);

  if (repeatedGroups.length === 0) {
    console.log("No duplicate companyNationalId values found.");
    return;
  }

  console.log(`Found ${repeatedGroups.length} duplicated companyNationalId value(s):`);

  for (const [companyNationalId, group] of repeatedGroups) {
    console.log(`\ncompanyNationalId=${companyNationalId}`);
    for (const user of group) {
      console.log(
        [
          `id=${user.id}`,
          `mobile=${user.mobile}`,
          `companyName=${user.companyName ?? ""}`,
          `stored=${user.companyNationalId ?? ""}`,
          `createdAt=${user.createdAt.toISOString()}`,
        ].join(" "),
      );
    }
  }

  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
