// app/actions/folderActions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** 로그인 사용자 ID */
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
  if (!folder) {
    throw new Error("부모 폴더를 찾을 수 없습니다.");
  }
  if (folder.createdById !== userId) {
    throw new Error("폴더에 대한 권한이 없습니다.");
  }
}

/** 템플릿 카테고리 매핑 (폴더 타입 -> 템플릿 카테고리) */
function mapFolderTypeToTemplateCategory(type: string | null | undefined) {
  switch (type) {
    case "ROOT_COVERLETTER":
      return "COVERLETTER";
    case "ROOT_RESUME":
      return "RESUME";
    case "ROOT_PORTFOLIO":
      return "PORTFOLIO";
    default:
      return null; // CUSTOM 등
  }
}

/** 폴더 생성 */
export async function createFolder(
  parentId: string | null,
  name: string,
  type:
    | "CUSTOM"
    | "ROOT_COVERLETTER"
    | "ROOT_RESUME"
    | "ROOT_PORTFOLIO" = "CUSTOM"
) {
  const userId = await getUserId();

  // 부모가 있으면 소유권 검증 + 실제 ownerId 가져오기
  let ownerId = userId;
  if (parentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: parentId },
      select: { createdById: true },
    });
    console.log("📂 createFolder parent check", { parentId, parentOwner: parent?.createdById, userId });
    if (!parent) throw new Error("부모 폴더가 존재하지 않습니다.");
    if (parent.createdById !== userId) throw new Error("폴더에 대한 권한이 없습니다.");
    ownerId = parent.createdById; // ✅ 자식의 createdById는 부모와 동일하게 강제
  }

  const safeName = (name ?? "").trim() || "새 폴더";
  console.log("📂 createFolder", { parentId, safeName, type, ownerId });

  const folder = await prisma.folder.create({
    data: {
      name: safeName,
      type,
      parentId,
      createdById: ownerId, // ✅ 핵심: 부모가 있으면 부모의 owner를 그대로 사용
    },
    select: { id: true, name: true, type: true, parentId: true, createdById: true },
  });

  console.log("✅ createFolder done", folder);
  return folder;
}

/** 폴더별 템플릿 목록 */
export async function getTemplatesByFolder(folderId: string) {
  const userId = await getUserId();

  // 폴더 존재/소유 검증 + 타입 조회
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { createdById: true, type: true },
  });
  if (!folder) throw new Error("폴더가 존재하지 않습니다.");
  if (folder.createdById !== userId) throw new Error("폴더에 대한 권한이 없습니다.");

  const category = mapFolderTypeToTemplateCategory(folder.type);
  const templates = await prisma.template.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    select: { key: true, label: true },
    orderBy: { label: "asc" },
  });

  return templates;
}
