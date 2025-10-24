// scripts/backfill-createdBy.ts
// 실행: pnpm dlx tsx scripts/backfill-createdBy.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const fallbackUserId = process.env.BACKFILL_USER_ID;
  if (!fallbackUserId) {
    throw new Error("환경변수 BACKFILL_USER_ID가 없습니다. .env(.local)에 추가하세요.");
  }

  // 현재 orphan 집계 (NULL 또는 빈 문자열)
  const [orphanFolderCount, orphanDocCount] = await Promise.all([
    prisma.folder.count({
      where: {
        OR: [
          { createdById: null },
          { createdById: "" },
        ],
      },
    }),
    prisma.document.count({
      where: {
        OR: [
          { createdById: null },
          { createdById: "" },
        ],
      },
    }),
  ]);

  console.log("현재 orphan 상태:", { orphanFolderCount, orphanDocCount });
  if (orphanFolderCount === 0 && orphanDocCount === 0) {
    console.log("🎉 orphan 레코드 없음. 백필 불필요!");
    return;
  }

  // 트랜잭션으로 업데이트
  await prisma.$transaction(async (tx) => {
    // Folder 백필
    const orphanFolders = await tx.folder.findMany({
      where: { OR: [{ createdById: null }, { createdById: "" }] },
      select: { id: true },
    });
    for (const f of orphanFolders) {
      await tx.folder.update({
        where: { id: f.id },
        data: { createdById: fallbackUserId },
      });
    }

    // Document 백필
    const orphanDocs = await tx.document.findMany({
      where: { OR: [{ createdById: null }, { createdById: "" }] },
      select: { id: true },
    });
    for (const d of orphanDocs) {
      await tx.document.update({
        where: { id: d.id },
        data: { createdById: fallbackUserId },
      });
    }
  });

  // 결과 재집계
  const [afterFolders, afterDocs] = await Promise.all([
    prisma.folder.count({ where: { OR: [{ createdById: null }, { createdById: "" }] } }),
    prisma.document.count({ where: { OR: [{ createdById: null }, { createdById: "" }] } }),
  ]);

  console.log("✅ backfill done. 잔여 orphan:", { folders: afterFolders, docs: afterDocs });
}

run()
  .catch((e) => {
    console.error("❌ backfill error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
