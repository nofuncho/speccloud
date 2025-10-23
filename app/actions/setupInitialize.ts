// app/actions/setupInitialize.ts
"use server";

import { prisma } from "@/lib/prisma";
import { aiDraftResume, aiDraftCoverLetter } from "@/lib/ai";

function toArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function ym(date?: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 7); // YYYY-MM
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* ---- 로컬 폴백 텍스트 템플릿 ---- */
function resumeTemplate(p: any, projects: any[]) {
  const edu = [p.school, p.major, p.graduationY ? `${p.graduationY} 졸업` : ""].filter(Boolean).join(" / ");
  const skills = toArray(p.skills).join(", ");
  const proj = projects.map((x: any) => {
    const period = `${ym(x.startDate)} ~ ${ym(x.endDate)}`.trim();
    const par = [x.problem && `문제: ${x.problem}`, x.action && `행동: ${x.action}`, x.result && `성과: ${x.result}`]
      .filter(Boolean).join(" / ");
    const tech = toArray(x.techStack).join(", ");
    return `- ${x.name || ""} ${x.role ? `(${x.role})` : ""}\n  기간: ${period}\n  ${par ? `요약: ${par}\n  ` : ""}기술: ${tech}`;
  }).join("\n");

  return `이력서
이름: ${p.name || ""}
이메일: ${p.email || ""}
연락처: ${p.phone || ""}

[학력]
- ${edu || "-"}

[보유 스킬]
- ${skills || "-"}

[경력 요약]
- ${p.currentCompany ? `${p.currentCompany} / ${p.currentRole || ""} (${p.totalYears || 0}년)` : "신입"}

[프로젝트]
${proj || "-"}
`;
}

function coverLetterTemplate(p: any) {
  const interests = toArray(p.interests).slice(0, 3).join(", ") || "관심 분야";
  const skills = toArray(p.skills).join(", ") || "-";
  const edu = [p.school, p.major, p.graduationY ? `${p.graduationY} 졸업` : ""].filter(Boolean).join(" / ");
  return `자기소개서(초안)

[지원동기]
저는 ${interests}에 강한 흥미를 갖고 있으며, ${p.currentRole || p.major || "관련 역량"}을 바탕으로 성장해왔습니다.

[강점/경험]
학력: ${edu || "-"}
보유 스킬: ${skills}

[포부]
귀사와 함께 ${interests}에서 임팩트를 만들고 싶습니다. 감사합니다.`;
}

/* ---- 초기 문서/폴더 생성 ---- */
export async function initializeUserDocuments(userId: string) {
  const p = await prisma.userProfile.findUnique({ where: { createdById: userId } });
  if (!p) return;

  const projects = await prisma.project.findMany({
    where: { createdById: userId },
    orderBy: { startDate: "desc" },
  });

  // 루트 폴더 보장
  const ROOTS: Array<{ name: string; type: string }> = [
    { name: "자기소개서", type: "ROOT_COVERLETTER" },
    { name: "이력서", type: "ROOT_RESUME" },
    { name: "포트폴리오", type: "ROOT_PORTFOLIO" },
    { name: "경력기술서", type: "CUSTOM" },
  ];

  const existing = await prisma.folder.findMany({
    where: { createdById: userId, parentId: null },
    select: { id: true, name: true },
  });
  const existingNames = new Set(existing.map((f) => f.name));
  for (const r of ROOTS) {
    if (!existingNames.has(r.name)) {
      await prisma.folder.create({
        data: { createdById: userId, name: r.name, type: r.type as any, parentId: null },
      });
    }
  }

  const roots = await prisma.folder.findMany({ where: { createdById: userId, parentId: null } });
  const getRoot = (name: string) => roots.find((r) => r.name === name)!;

  const resumeRoot = getRoot("이력서");
  const coverRoot = getRoot("자기소개서");

  /* ---- 이력서 생성 (AI → 폴백) ---- */
  const resumeExists = await prisma.document.findFirst({
    where: { createdById: userId, folderId: resumeRoot.id, title: "이력서_초안" },
    select: { id: true },
  });

  if (!resumeExists) {
    let contentText = "";
    try {
      const ai = await aiDraftResume(p, projects);
      contentText = ai || resumeTemplate(p, projects);
    } catch {
      contentText = resumeTemplate(p, projects);
    }
    const html = `<pre>${escapeHtml(contentText)}</pre>`;
    await prisma.document.create({
      data: {
        createdById: userId,
        folderId: resumeRoot.id,
        title: "이력서_초안",
        content: { blocks: [{ type: "doc", html }] },
      },
    });
  }

  /* ---- 자기소개서 생성 (AI → 폴백) ---- */
  const coverExists = await prisma.document.findFirst({
    where: { createdById: userId, folderId: coverRoot.id, title: "자기소개서_초안" },
    select: { id: true },
  });

  if (!coverExists) {
    let contentText = "";
    try {
      const ai = await aiDraftCoverLetter(p);
      contentText = ai || coverLetterTemplate(p);
    } catch {
      contentText = coverLetterTemplate(p);
    }
    const html = `<pre>${escapeHtml(contentText)}</pre>`;
    await prisma.document.create({
      data: {
        createdById: userId,
        folderId: coverRoot.id,
        title: "자기소개서_초안",
        content: { blocks: [{ type: "doc", html }] },
      },
    });
  }
}
