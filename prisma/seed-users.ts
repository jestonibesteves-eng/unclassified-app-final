import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: "superadmin" } });
  if (existing) {
    console.log("Super admin already exists. Skipping.");
    return;
  }

  const hash = await bcrypt.hash("DARRegion5@2025", 12);
  await prisma.user.create({
    data: {
      username: "superadmin",
      password_hash: hash,
      full_name: "Super Administrator",
      role: "super_admin",
      office_level: "regional",
      must_change_password: true,
      is_active: true,
    },
  });

  console.log("✓ Super admin created");
  console.log("  Username: superadmin");
  console.log("  Password: DARRegion5@2025");
  console.log("  (User will be prompted to change password on first login)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
