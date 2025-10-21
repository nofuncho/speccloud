// app/actions/folderActions.ts
"use server";

import { FolderType, Prisma, TemplateCategory } from "@prisma/client";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUserId() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const exists = await prisma.user.count({ where: { id: userId } });
  if (!exists) {
    console.error("getUserId: session.user.id not found in DB", { userId });
    throw new Error("사용자 정보를 찾을 수 없습니다.");
  }
  return userId;
}

async function assertFolderOwner(folderId: string, userId: string) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { createdById: true },
  });
  if (!folder) throw new Error("폴더가 존재하지 않습니다.");
  if (folder.createdById !== userId)
    throw new Error("폴더에 대한 권한이 없습니다.");
}

async function assertDocumentOwner(documentId: string, userId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { createdById: true },
  });
  if (!document) throw new Error("문서를 찾을 수 없습니다.");
  if (document.createdById !== userId)
    throw new Error("문서에 대한 권한이 없습니다.");
}

export async function ensureRootFolders() {
  const userId = await getUserId();

  const existing = await prisma.folder.findMany({
    where: { parentId: null, createdById: userId },
    select: { name: true },
  });

  const required: { name: string; type: FolderType }[] = [
    { name: "자기소개서", type: FolderType.ROOT_COVERLETTER },
    { name: "이력서", type: FolderType.ROOT_RESUME },
    { name: "포트폴리오", type: FolderType.ROOT_PORTFOLIO },
  ];

  const toCreate = required.filter(
    (item) => !existing.some((folder) => folder.name === item.name),
  );

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((item) =>
        prisma.folder.create({
          data: { ...item, createdById: userId },
        }),
      ),
    );
  }

  revalidatePath("/app");
}

export async function createFolder(
  parentId: string | null,
  name: string,
  type: "CUSTOM" | "ROOT_COVERLETTER" | "ROOT_RESUME" | "ROOT_PORTFOLIO" = "CUSTOM",
) {
  const userId = await getUserId();

  if (parentId) {
    await assertFolderOwner(parentId, userId);
  }

  const baseName = (name ?? "").trim() || "새 폴더";

  const siblings = await prisma.folder.findMany({
    where: { createdById: userId, parentId: parentId ?? null },
    select: { name: true },
  });

  const taken = new Set(siblings.map((s) => s.name));
  const nextAvailableName = (base: string) => {
    if (!taken.has(base)) return base;
    let counter = 2;
    while (true) {
      const candidate = `${base} (${counter})`;
      if (!taken.has(candidate)) return candidate;
      counter += 1;
    }
  };

  let safeName = nextAvailableName(baseName);

  try {
    const folder = await prisma.folder.create({
      data: {
        name: safeName,
        type,
        parentId,
        createdById: userId,
      },
      select: { id: true, name: true, type: true, parentId: true, createdById: true },
    });
    revalidatePath("/app");
    return folder;
  } catch (error: any) {
    if (error?.code === "P2002") {
      safeName = nextAvailableName(safeName);
      const folder = await prisma.folder.create({
        data: {
          name: safeName,
          type,
          parentId,
          createdById: userId,
        },
        select: { id: true, name: true, type: true, parentId: true, createdById: true },
      });
      revalidatePath("/app");
      return folder;
    }
    throw error;
  }
}

export async function getTemplatesByFolder(folderId: string) {
  const userId = await getUserId();
  await assertFolderOwner(folderId, userId);

  let folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, parentId: true, type: true },
  });

  if (!folder) throw new Error("폴더가 존재하지 않습니다.");

  while (folder.parentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: folder.parentId },
      select: { id: true, parentId: true, type: true, createdById: true },
    });
    if (!parent) break;
    if (parent.createdById !== userId)
      throw new Error("상위 폴더에 대한 권한이 없습니다.");
    folder = parent;
  }

  const categoryByRoot: Record<FolderType, TemplateCategory> = {
    [FolderType.ROOT_COVERLETTER]: TemplateCategory.COVERLETTER,
    [FolderType.ROOT_RESUME]: TemplateCategory.RESUME,
    [FolderType.ROOT_PORTFOLIO]: TemplateCategory.PORTFOLIO,
    [FolderType.CUSTOM]: TemplateCategory.COVERLETTER,
  };

  const category = categoryByRoot[folder.type] ?? TemplateCategory.COVERLETTER;

  return prisma.template.findMany({
    where: { category, isActive: true },
    select: { key: true, label: true },
    orderBy: { label: "asc" },
  });
}

export async function createDocument(
  folderId: string,
  title: string,
  templateKey: string,
) {
  const userId = await getUserId();
  await assertFolderOwner(folderId, userId);

  const template = await prisma.template.findUnique({
    where: { key: templateKey },
  });
  if (!template) throw new Error("템플릿을 찾을 수 없습니다.");

  const doc = await prisma.document.create({
    data: {
      folderId,
      title: title?.trim() || "새 문서",
      templateKey,
      content: template.schema as Prisma.InputJsonValue,
      createdById: userId,
    },
    select: { id: true, folderId: true, title: true },
  });

  revalidatePath("/app");
  return doc;
}

export async function renameDocument(documentId: string, title: string) {
  const userId = await getUserId();
  await assertDocumentOwner(documentId, userId);

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { title: title?.trim() || "제목 없음" },
  });

  revalidatePath("/app");
  return updated;
}

export async function saveDocumentText(documentId: string, text: string) {
  const userId = await getUserId();
  await assertDocumentOwner(documentId, userId);

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { content: { raw: text } as Prisma.InputJsonValue },
  });

  revalidatePath("/app");
  return updated;
}

export async function saveDocumentJson(
  documentId: string,
  content: Prisma.InputJsonValue,
) {
  const userId = await getUserId();
  await assertDocumentOwner(documentId, userId);

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { content },
  });

  revalidatePath("/app");
  return updated;
}

export async function renameFolder(folderId: string, name: string) {
  const userId = await getUserId();
  await assertFolderOwner(folderId, userId);

  const safeName = (name ?? "").trim() || "새 폴더";

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: { name: safeName },
    select: { id: true, name: true },
  });

  revalidatePath("/app");
  return updated;
}
