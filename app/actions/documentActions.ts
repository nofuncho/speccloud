// app/actions/documentActions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** 세션에서 로그인 사용자 ID 확보 (없으면 에러) */
async function getUserId() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");
  return userId;
}

/** 폴더 소유권 검증 */
async function assertFolderOwner(folderId: string, userId: string) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { createdById: true },
  });
  if (!folder || folder.createdById !== userId) {
    throw new Error("폴더에 대한 권한이 없습니다.");
  }
}

/** 문서 소유권 검증 + 필요한 필드 선택적으로 가져오기 */
async function getOwnedDocument<T extends object>(
  docId: string,
  userId: string,
  select: T
) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    // @ts-ignore - Prisma select 제네릭 단순화를 위한 무시
    select,
  });
  if (!doc || (doc as any).createdById !== userId) {
    throw new Error("문서에 대한 권한이 없습니다.");
  }
  return doc as any as { createdById: string } & T;
}

/** ✅ 문서 생성 — 객체 인자 기반 */
export async function createDocumentAction(input: {
  folderId: string;
  title?: string;
  templateKey?: string | null;
  company?: string | null;
  role?: string | null;
  status?: string | null;
}) {
  const userId = await getUserId();
  await assertFolderOwner(input.folderId, userId);

  const safeTitle = (input.title ?? "").trim() || "제목 없음";

  console.log("📝 createDocumentAction", {
    folderId: input.folderId,
    userId,
    title: safeTitle,
  });

  const doc = await prisma.document.create({
    data: {
      folderId: input.folderId,
      title: safeTitle,
      content: { blocks: [] },
      templateKey: input.templateKey ?? null,
      company: input.company ?? null,
      role: input.role ?? null,
      status: input.status ?? null,
      createdById: userId,
    },
    select: { id: true, folderId: true, title: true },
  });

  return doc;
}

/** 문서 제목 변경 */
export async function renameDocument(docId: string, title: string) {
  const userId = await getUserId();

  await getOwnedDocument(docId, userId, { createdById: true });

  return prisma.document.update({
    where: { id: docId },
    data: { title: title.trim() || "제목 없음" },
  });
}

/** 문서 내용 저장 */
export async function saveDocumentJson(docId: string, content: any) {
  const userId = await getUserId();

  await getOwnedDocument(docId, userId, { createdById: true });

  return prisma.document.update({
    where: { id: docId },
    data: { content },
  });
}

/* =========================
   ▼ 추가: 사본 만들기 / 삭제
   ========================= */

/** (내부) 사본 제목 생성: 같은 폴더 내 중복 시 (사본 N) 증가 */
async function buildCopyTitle(folderId: string, baseTitle: string) {
  const base = (baseTitle || "제목 없음").trim();
  let candidate = `${base} (사본)`;

  // 같은 제목이 몇 개인지 확인
  const sameCount = await prisma.document.count({
    where: { folderId, title: candidate },
  });

  if (sameCount > 0) {
    candidate = `${base} (사본 ${sameCount + 1})`;
  }
  return candidate;
}

/** ✅ 문서 사본 만들기 (같은 폴더에 복제) */
export async function duplicateDocumentAction(docId: string) {
  const userId = await getUserId();

  // 원본 조회 + 권한 검증
  const src = await getOwnedDocument(
    docId,
    userId,
    {
      createdById: true,
      id: true,
      folderId: true,
      title: true,
      content: true,
      templateKey: true,
      company: true,
      role: true,
      status: true,
    }
  );

  const newTitle = await buildCopyTitle(src.folderId!, src.title ?? "제목 없음");

  const newDoc = await prisma.document.create({
    data: {
      folderId: src.folderId!,
      title: newTitle,
      content: src.content as any,
      templateKey: src.templateKey ?? null,
      company: src.company ?? null,
      role: src.role ?? null,
      status: src.status ?? "draft",
      createdById: userId,
    },
    select: { id: true, folderId: true, title: true },
  });

  return newDoc; // { id, folderId, title }
}

/** ✅ 문서 삭제 */
export async function deleteDocumentAction(docId: string) {
  const userId = await getUserId();

  // 권한 검증
  await getOwnedDocument(docId, userId, { createdById: true });

  await prisma.document.delete({ where: { id: docId } });

  return { ok: true };
}
