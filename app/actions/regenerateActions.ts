// app/actions/regenerateActions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { aiDraftResume, aiDraftCoverLetter } from "@/lib/ai";
import { revalidatePath } from "next/cache";

type Kind = "resume" | "coverletter";

function toArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
function ym(date?: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 7);
}
function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/* ---- 로컬 폴백 템플릿 ---- */
function fallbackResume(profile: any, projects: any[]) {
  const edu = [profile.school, profile.major, profile.graduationY ? `${profile.graduationY} 졸업` : ""]
    .filter(Boolean).join(" / ");
  const skills = toArray(profile.skills).join(", ");
  const proj = projects.map((x: any) => {
    const period = `${ym(x.startDate)} ~ ${ym(x.endDate)}`.trim();
    const par = [x.problem && `문제: ${x.problem}`, x.action && `행동: ${x.action}`, x.result && `성과: ${x.result}`]
      .filter(Boolean).join(" / ");
    const tech = toArray(x.techStack).join(", ");
    return `- ${x.name || ""} ${x.role ? `(${x.role})` : ""}\n  기간: ${period}\n  ${par ? `요약: ${par}\n  ` : ""}기술: ${tech}`;
  }).join("\n");

  return `이력서
이름: ${profile.name || ""}
이메일: ${profile.email || ""}
연락처: ${profile.phone || ""}

[학력]
- ${edu || "-"}

[보유 스킬]
- ${skills || "-"}

[경력 요약]
- ${profile.currentCompany ? `${profile.currentCompany} / ${profile.currentRole || ""} (${profile.totalYears || 0}년)` : "신입"}

[프로젝트]
${proj || "-"}
`;
}
function fallbackCoverLetter(profile: any) {
  const interests = toArray(profile.interests).slice(0, 3).join(", ") || "관심 분야";
  const skills = toArray(profile.skills).join(", ") || "-";
  const edu = [profile.school, profile.major, profile.graduationY ? `${profile.graduationY} 졸업` : ""]
    .filter(Boolean).join(" / ");
  return `자기소개서(초안)

[지원동기]
저는 ${interests}에 강한 흥미를 갖고 있으며, ${profile.currentRole || profile.major || "관련 역량"}을 바탕으로 성장해왔습니다.

[강점/경험]
학력: ${edu || "-"}
보유 스킬: ${skills}

[포부]
귀사와 함께 ${interests}에서 임팩트를 만들고 싶습니다. 감사합니다.`;
}

/**
 * kind: "resume" | "coverletter"
 * - 해당 루트 폴더 찾고, 문서(이력서_초안 / 자기소개서_초안) 재생성(업데이트)
 */
export async function regenerateDocument(kind: Kind) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  const profile = await prisma.userProfile.findUnique({ where: { createdById: userId } });
  if (!profile) throw new Error("기초세팅 정보가 없습니다.");

  const projects = await prisma.project.findMany({
    where: { createdById: userId },
    orderBy: { startDate: "desc" },
  });

  // 루트 폴더 찾기
  const rootName = kind === "resume" ? "이력서" : "자기소개서";
  const title = kind === "resume" ? "이력서_초안" : "자기소개서_초안";

  const root = await prisma.folder.findFirst({
    where: { createdById: userId, parentId: null, name: rootName },
    select: { id: true },
  });
  if (!root) throw new Error(`${rootName} 루트 폴더가 없습니다.`);

  // AI 시도 → 폴백
  let text = "";
  try {
    text =
      kind === "resume"
        ? (await aiDraftResume(profile, projects)) || fallbackResume(profile, projects)
        : (await aiDraftCoverLetter(profile)) || fallbackCoverLetter(profile);
  } catch {
    text = kind === "resume" ? fallbackResume(profile, projects) : fallbackCoverLetter(profile);
  }
  const html = `<pre>${escapeHtml(text)}</pre>`;

  // 기존 문서 있으면 업데이트, 없으면 생성
  const existing = await prisma.document.findFirst({
    where: { createdById: userId, folderId: root.id, title },
    select: { id: true },
  });

  let docId: string;
  if (existing) {
    const updated = await prisma.document.update({
      where: { id: existing.id },
      data: { content: { blocks: [{ type: "doc", html }] } },
      select: { id: true },
    });
    docId = updated.id;
  } else {
    const created = await prisma.document.create({
      data: {
        createdById: userId,
        folderId: root.id,
        title,
        content: { blocks: [{ type: "doc", html }] },
      },
      select: { id: true },
    });
    docId = created.id;
  }

  // 화면 갱신
  revalidatePath("/app"); // 중앙 Pane 새로고침 (query가 있어도 router.refresh로 커버됨)
  return { ok: true, docId, folderId: root.id, title };
}
