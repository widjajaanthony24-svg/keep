import { Prisma } from "@prisma/client";
import { sampleBuilding } from "@keep/building-graph";
import { prisma } from "./db.js";
import { hashPassword } from "./auth/auth.utils.js";

async function main() {
  const email = "demo@keep.local";
  const password = "keep-demo-1234";

  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name: "Demo Account",
      },
    }));

  const projectCount = await prisma.project.count({ where: { ownerId: user.id } });
  if (projectCount === 0) {
    await prisma.project.create({
      data: {
        name: "Sample House",
        mode: "creative",
        ownerId: user.id,
        buildingGraph: sampleBuilding as unknown as Prisma.InputJsonValue,
      },
    });
  }

  console.log("Seed complete.");
  console.log(`  Demo login: ${email} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
