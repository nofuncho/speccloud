// app/actions/onboardingActions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initializeUserDocuments } from "@/app/actions/setupInitialize";

type SavePayload = {
  profile: any;
  projects: any[];
};

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toJsonArray(v: any): any[] | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : null;
  }
  return null;
}

function parsePeriodYM(period?: string): { startDate: Date | null; endDate: Date | null } {
  if (!period) return { startDate: null, endDate: null };
  const [a, b] = period.split("~").map((s) => s.trim());
  const toDate = (s?: string | null) => {
    if (!s) return null;
    // 허용 입력: "YYYY.MM" | "YYYY-MM" | "YYYY/MM"
    const norm = s.replace(/[\/\-]/g, "."); // "2023.01"
    const m = /^(\d{4})\.(\d{1,2})$/.exec(norm);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (!y || !mo) return null;
    return new Date(Date.UTC(y, mo - 1, 1));
  };
  return { startDate: toDate(a), endDate: toDate(b) };
}

export async function saveOnboardingAndInitialize(payload: SavePayload) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  const p = payload.profile ?? {};

  // Json 배열로 저장 (MySQL 원시 배열 불가)
  const interests = toJsonArray(p.interests);
  const skills = toJsonArray(p.skills);

  // Upsert by createdById (스키마에서 createdById가 unique)
  const profile = await prisma.userProfile.upsert({
    where: { createdById: userId },
    update: {
      name: p.name ?? "",
      email: p.email ?? "",
      phone: p.phone ?? null,
      school: p.school ?? null,
      major: p.major ?? null,
      graduationY: toNum(p.graduationY),
      gpa: toNum(p.gpa),
      gpaMax: toNum(p.gpaMax),
      interests: interests ?? undefined, // undefined면 변경 안 함
      skills: skills ?? undefined,
      isExperienced: Boolean(p.isExperienced),
      totalYears: toNum(p.totalYears),
      currentCompany: p.currentCompany ?? null,
      currentRole: p.currentRole ?? null,
    },
    create: {
      createdById: userId,
      name: p.name ?? "",
      email: p.email ?? "",
      phone: p.phone ?? null,
      school: p.school ?? null,
      major: p.major ?? null,
      graduationY: toNum(p.graduationY),
      gpa: toNum(p.gpa),
      gpaMax: toNum(p.gpaMax),
      interests: interests, // null 가능
      skills: skills,       // null 가능
      isExperienced: Boolean(p.isExperienced),
      totalYears: toNum(p.totalYears),
      currentCompany: p.currentCompany ?? null,
      currentRole: p.currentRole ?? null,
    },
  });

  // 프로젝트 저장: 기존 삭제 후 재삽입(간단/안전)
  await prisma.project.deleteMany({ where: { createdById: userId } });

  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  for (const pr of projects) {
    const { startDate, endDate } = parsePeriodYM(pr.period);
    const techStack = toJsonArray(pr.techStack);
    await prisma.project.create({
      data: {
        createdById: userId,
        name: pr.name ?? "프로젝트",
        role: pr.role ?? null,
        startDate,
        endDate,
        problem: pr.problem ?? null,
        action: pr.action ?? null,
        result: pr.result ?? null,
        techStack, // Json
      },
    });
  }

  // 초기 문서 생성 (이력서/자소서 초안)
  await initializeUserDocuments(userId);

  return { ok: true, profileId: profile.id };
}
