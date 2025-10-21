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

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { createdById: true },
  });
  if (!doc || doc.createdById !== userId) {
    throw new Error("문서에 대한 권한이 없습니다.");
  }

  return prisma.document.update({
    where: { id: docId },
    data: { title: title.trim() || "제목 없음" },
  });
}

/** 문서 내용 저장 */
export async function saveDocumentJson(docId: string, content: any) {
  const userId = await getUserId();

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { createdById: true },
  });
  if (!doc || doc.createdById !== userId) {
    throw new Error("문서에 대한 권한이 없습니다.");
  }

  return prisma.document.update({
    where: { id: docId },
    data: { content },
  });
}
