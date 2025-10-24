// scripts/backfill-createdBy.autodetect.ts
// 실행: pnpm dlx tsx scripts/backfill-createdBy.autodetect.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DetectResult = {
  dbName: string;
  folderTable: string;
  documentTable: string;
  folderCol: string | null;
  documentCol: string | null;
};

const CANDIDATE_COLS = [
  "createdById",
  "created_by_id",
  "ownerId",
  "authorId",
  "userId",
];

async function detect(): Promise<DetectResult> {
  const [{ dbName }] = await prisma.$queryRaw<{ dbName: string }[]>`SELECT DATABASE() AS dbName`;
  // 테이블 실제명(대소문자 포함) 탐지
  const tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ${dbName} AND TABLE_NAME IN ('Folder','folder','Document','document')
  `;
  // 폴더/문서 테이블명 후보
  const folderTable = tables.find(t => t.TABLE_NAME.toLowerCase() === "folder")?.TABLE_NAME ?? "Folder";
  const documentTable = tables.find(t => t.TABLE_NAME.toLowerCase() === "document")?.TABLE_NAME ?? "Document";

  // 각 테이블의 컬럼명들
  const cols = await prisma.$queryRaw<{ COLUMN_NAME: string, TABLE_NAME: string }[]>`
    SELECT COLUMN_NAME, TABLE_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ${dbName}
      AND TABLE_NAME IN (${folderTable}, ${documentTable})
  `;

  const findCol = (table: string) => {
    const cands = cols.filter(c => c.TABLE_NAME === table).map(c => c.COLUMN_NAME);
    // 우선순위대로 매칭
    for (const key of CANDIDATE_COLS) {
      const hit = cands.find(cn => cn === key);
      if (hit) return hit;
      // 느슨한 부분일치 (예: created_by_id_legacy)
      const loose = cands.find(cn => cn.toLowerCase().includes("createdby") || cn.toLowerCase().includes("ownerid") || cn.toLowerCase().includes("authorid"));
      if (loose) return loose;
    }
    return null;
  };

  const folderCol = findCol(folderTable);
  const documentCol = findCol(documentTable);

  return { dbName, folderTable, documentTable, folderCol, documentCol };
}

async function countNullOrEmpty(table: string, col: string) {
  const [row] = await prisma.$queryRawUnsafe<any>(`
    SELECT
      SUM(CASE WHEN ${col} IS NULL THEN 1 ELSE 0 END) AS null_cnt,
      SUM(CASE WHEN ${col} = '' THEN 1 ELSE 0 END) AS empty_cnt
    FROM ${table}
  `);
  return { null_cnt: Number(row?.null_cnt ?? 0), empty_cnt: Number(row?.empty_cnt ?? 0) };
}

async function backfill(table: string, col: string, userId: string) {
  const affected1 = await prisma.$executeRawUnsafe(`
    UPDATE ${table}
    SET ${col} = ?
    WHERE ${col} IS NULL
  `, userId);

  const affected2 = await prisma.$executeRawUnsafe(`
    UPDATE ${table}
    SET ${col} = ?
    WHERE ${col} = ''
  `, userId);

  return affected1 + affected2;
}

async function run() {
  const userId = process.env.BACKFILL_USER_ID;
  if (!userId) {
    throw new Error("환경변수 BACKFILL_USER_ID가 없습니다. .env(.local)에 추가하세요.");
  }

  const d = await detect();

  console.log("🔎 탐지 결과:", d);

  if (!d.folderCol && !d.documentCol) {
    throw new Error(
      `Folder/Document 테이블에서 후보 컬럼(${CANDIDATE_COLS.join(", ")})을 찾지 못했습니다.\n` +
      `schema.prisma에서 실제 소유자 컬럼명을 확인한 뒤, 스크립트 상단 CANDIDATE_COLS에 추가하세요.`
    );
  }

  if (d.folderCol) {
    const before = await countNullOrEmpty(d.folderTable, d.folderCol);
    console.log(`📦 ${d.folderTable}.${d.folderCol} orphan (before):`, before);
    const changed = await backfill(d.folderTable, d.folderCol, userId);
    const after = await countNullOrEmpty(d.folderTable, d.folderCol);
    console.log(`✅ ${d.folderTable} backfill changed: ${changed}, after:`, after);
  } else {
    console.log(`ℹ️ ${d.folderTable}에는 소유자 컬럼을 찾지 못해 건너뜀.`);
  }

  if (d.documentCol) {
    const before = await countNullOrEmpty(d.documentTable, d.documentCol);
    console.log(`📝 ${d.documentTable}.${d.documentCol} orphan (before):`, before);
    const changed = await backfill(d.documentTable, d.documentCol, userId);
    const after = await countNullOrEmpty(d.documentTable, d.documentCol);
    console.log(`✅ ${d.documentTable} backfill changed: ${changed}, after:`, after);
  } else {
    console.log(`ℹ️ ${d.documentTable}에는 소유자 컬럼을 찾지 못해 건너뜀.`);
  }
}

run()
  .catch((e) => {
    console.error("❌ backfill error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
