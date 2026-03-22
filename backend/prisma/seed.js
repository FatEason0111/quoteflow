import { prisma } from "../src/lib/prisma.js";
import { seedDemoData } from "./seed-data.js";

seedDemoData()
  .then((result) => {
    console.log(
      JSON.stringify(
        {
          workspace: result.workspace.slug,
          users: result.users.map((user) => ({
            email: user.email,
            role: user.role,
          })),
          defaultPassword: result.defaultPassword,
          packageIds: result.packageIds,
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
