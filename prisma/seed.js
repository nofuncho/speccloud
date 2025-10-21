// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "demo@speccloud.local";
  const plain = "demo1234";

  // 1️⃣ 유저 생성 (없으면 생성)
  const password = await bcrypt.hash(plain, 10);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        password,
        name: "Demo User",
      },
    });
  }

  // 2️⃣ 루트 폴더 자동 생성
  const roots = [
    { name: "자기소개서", type: "ROOT_COVERLETTER" },
    { name: "이력서", type: "ROOT_RESUME" },
    { name: "포트폴리오", type: "ROOT_PORTFOLIO" },
  ];

  for (const r of roots) {
    const exists = await prisma.folder.findFirst({
      where: { createdById: user.id, parentId: null, name: r.name },
    });
    if (!exists) {
      await prisma.folder.create({
        data: {
          name: r.name,
          type: r.type,
          createdById: user.id,
        },
      });
    }
  }

  console.log("\n✅ Seed done.");
  console.log("   DEMO_USER_ID =", user.id);
  console.log("   email:", email);
  console.log("   password:", plain, "\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
