"use server";

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const BRIEF_TTL_DAYS = Number(process.env.COMPANY_BRIEF_TTL_DAYS ?? 30);

if (!API_KEY) {
  throw new Error("[companyBrief] OPENAI_API_KEY 가 설정되어 있지 않습니다.");
}

const client = new OpenAI({ apiKey: API_KEY });

export type CompanyBrief = {
  company: string;
  role?: string | null;
  blurb: string;
  bullets: string[];
  updatedAt: string;
};

/** TTL 검사 (기본 30일) */
function isStale(d: Date | null | undefined, days = BRIEF_TTL_DAYS) {
  if (!d) return true;
  const diff = Date.now() - d.getTime();
  return diff > days * 24 * 60 * 60 * 1000;
}

/** OpenAI 호출 → 새 요약 생성 */
async function generateBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const sys =
    "You are a helpful assistant that prepares concise Korean company briefs for job applicants. " +
    "Always write in Korean. Be accurate but if not sure, use bracketed placeholders like [연도], [X명], [수치?]. " +
    "Keep it concise and practical for resume/cover-letter writing.";

  const user = [
    `회사명: ${company}`,
    role ? `지원 포지션: ${role}` : "",
    "",
    "요구사항:",
    "- 2~3문장 blurb: 회사 핵심 소개, 산업/제품/차별점.",
    "- bullets 4~6개: 비즈니스 모델, 주요 제품/서비스, 사용자/고객군, 경쟁 우위, 최근 전략/이슈/지표(모르면 [추정]/[정보 없음] 형태), 문화/핵심가치(알려진 범위).",
    "- 과장 금지. 불확실하면 [대괄호] 처리. 실존 고유명사·날짜 임의 창작 금지.",
    "- JSON만 출력",
    "",
    `JSON 스키마 예시:
{
  "company": "카카오",
  "role": "프론트엔드 엔지니어",
  "blurb": "카카오는 …",
  "bullets": ["• …", "• …", "• …", "• …"]
}`,
  ].join("\n");

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}$/);
    if (m) parsed = JSON.parse(m[0]);
  }

  const blurb = (parsed?.blurb ?? "").toString().trim() || `${company} 관련 요약`;
  const bullets: string[] =
    Array.isArray(parsed?.bullets) && parsed.bullets.length
      ? parsed.bullets.map((x: any) => String(x))
      : [
          "• [정보 부족] 핵심 제품/서비스",
          "• [정보 부족] 주요 고객/시장",
          "• [정보 부족] 경쟁/차별점",
          "• [정보 부족] 최근 전략/지표",
        ];

  return {
    company,
    role: role ?? undefined,
    blurb,
    bullets,
    updatedAt: new Date().toISOString(),
  };
}

/** ✅ DB 캐시 조회 또는 새로 생성 */
export async function fetchCompanyBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const key = { company: company.trim(), role: (role ?? null)?.trim?.() || null };

  // 1️⃣ 기존 데이터 조회
  const found = await prisma.companyBrief.findUnique({
    where: { company_role: key },
  });

  // 2️⃣ TTL 만료 시 새로 생성
  if (!found || isStale(found.updatedAt)) {
    try {
      const fresh = await generateBrief(key.company, key.role ?? undefined);
      const saved = await prisma.companyBrief.upsert({
        where: { company_role: key },
        create: {
          company: key.company,
          role: key.role,
          blurb: fresh.blurb,
          bullets: fresh.bullets,
        },
        update: {
          blurb: fresh.blurb,
          bullets: fresh.bullets,
        },
      });
      return {
        company: saved.company,
        role: saved.role ?? undefined,
        blurb: saved.blurb,
        bullets: (saved.bullets as any[])?.map(String) ?? [],
        updatedAt: saved.updatedAt.toISOString(),
      };
    } catch (e) {
      console.error("[companyBrief] refresh error:", e);
      if (found) {
        return {
          company: found.company,
          role: found.role ?? undefined,
          blurb: found.blurb,
          bullets: (found.bullets as any[])?.map(String) ?? [],
          updatedAt: found.updatedAt.toISOString(),
        };
      }
      return {
        company: key.company,
        role: key.role ?? undefined,
        blurb: `${key.company} 관련 요약을 불러오지 못했습니다.`,
        bullets: ["• [정보 없음]"],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // 3️⃣ 최신 캐시 반환
  return {
    company: found.company,
    role: found.role ?? undefined,
    blurb: found.blurb,
    bullets: (found.bullets as any[])?.map(String) ?? [],
    updatedAt: found.updatedAt.toISOString(),
  };
}

/** ✅ 최근 업데이트된 회사 요약 목록 */
export async function listRecentCompanyBriefs(limit = 8): Promise<CompanyBrief[]> {
  const rows = await prisma.companyBrief.findMany({
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 20),
  });
  return rows.map((r) => ({
    company: r.company,
    role: r.role ?? undefined,
    blurb: r.blurb,
    bullets: (r.bullets as any[])?.map(String) ?? [],
    updatedAt: r.updatedAt.toISOString(),
  }));
}
