// app/actions/documentMeta.ts
"use server";

import { prisma } from "@/lib/prisma";

type Payload = { company?: string; role?: string };

export async function updateDocumentMeta(id: string, payload: Payload) {
  // 전달된 키만 업데이트 (undefined는 무시, null은 지우고 싶을 때만 사용)
  const data: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(payload, "company")) {
    data.company = payload.company ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "role")) {
    data.role = payload.role ?? null;
  }

  if (Object.keys(data).length === 0) {
    // 아무것도 바꿀 게 없으면 그냥 현재값만 돌려줌
    const cur = await prisma.document.findUnique({
      where: { id },
      select: { id: true, company: true, role: true },
    });
    return cur;
  }

  const updated = await prisma.document.update({
    where: { id },
    data,
    select: { id: true, company: true, role: true, updatedAt: true },
  });

  return updated;
}
