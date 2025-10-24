"use server";

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

/** =========================
 *  ENV & 기본 설정
 *  ========================= */
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const BRIEF_TTL_DAYS = Number(process.env.COMPANY_BRIEF_TTL_DAYS ?? 30);
/** (옵션) 실시간 뉴스 병합: 키가 없으면 자동 건너뜀 */
const NEWS_API_ENDPOINT = process.env.NEWS_API_ENDPOINT;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
/** (옵션) 확장 섹션 생성: 0/1 (기본 1) */
const ENABLE_ENRICH = (process.env.COMPANY_BRIEF_ENRICH ?? "1") !== "0";

if (!API_KEY) {
  throw new Error("[companyBrief] OPENAI_API_KEY 가 설정되어 있지 않습니다.");
}

const client = new OpenAI({ apiKey: API_KEY });

/** =========================
 *  타입 정의
 *  ========================= */
export type BriefNews = {
  title: string;
  url?: string;
  source?: string;
  date?: string; // ISO or yyyy-mm-dd
};

export type CompanyBrief = {
  company: string;
  role?: string | null;

  /** 기존 필드(캐시/DB 저장) */
  blurb: string;
  bullets: string[];

  /** 새 확장 필드(메모리 전용; DB는 기존 스키마 유지) */
  values?: string[];          // 회사 핵심 가치/문화
  hiringFocus?: string[];     // JD에서 강조되는 역량/경험
  resumeTips?: string[];      // 서류 합격 꿀팁
  interviewTips?: string[];   // 면접 팁
  recent?: BriefNews[];       // 최근 이슈/뉴스 (실시간 뉴스 API 있으면 병합)

  updatedAt: string;
};

/** =========================
 *  TTL 검사 (기본 30일)
 *  ========================= */
function isStale(d: Date | null | undefined, days = BRIEF_TTL_DAYS) {
  if (!d) return true;
  const diff = Date.now() - d.getTime();
  return diff > days * 24 * 60 * 60 * 1000;
}

/** =========================
 *  (옵션) 실시간 뉴스 조회
 *  - 키 없으면 빈 배열 반환
 *  - 사용하는 외부 뉴스 API 응답 구조에 맞춰 아래 매핑만 조정
 *  ========================= */
async function fetchCompanyNews(company: string): Promise<BriefNews[]> {
  if (!NEWS_API_ENDPOINT || !NEWS_API_KEY) return [];
  try {
    const url = `${NEWS_API_ENDPOINT}?q=${encodeURIComponent(company)}&count=5`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${NEWS_API_KEY}` },
      // next: { revalidate: 10800 } // 필요 시 캐시
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data?.articles || data?.value || data?.items || []) as any[];
    return items
      .slice(0, 5)
      .map((it) => ({
        title: it.title ?? it.name ?? "",
        url: it.url ?? it.link,
        source: it.source?.name ?? it.provider?.[0]?.name ?? it.source ?? "",
        date: it.publishedAt ?? it.datePublished ?? it.pubDate,
      }))
      .filter((n) => n.title);
  } catch {
    return [];
  }
}

/** =========================
 *  OpenAI 호출 → 확장 브리프 생성(JSON 엄격)
 *  - DB에는 blurb/bullets만 저장, 나머지는 응답으로만 전달
 *  ========================= */
async function generateBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const sys = [
    "You are a helpful assistant that prepares concise Korean company briefs for job applicants.",
    "Always write in Korean.",
    "Be accurate but if not sure, use bracketed placeholders like [연도], [X명], [수치?].",
    "Keep it concise and practical for resume/cover-letter writing.",
    "",
    "Return STRICT JSON only with keys:",
    "company, role, blurb, bullets, values, hiring_focus, resume_tips, interview_tips.",
    "- bullets: 4~6개, 비즈니스 모델/제품/고객/경쟁우위/최근 전략·지표(모르면 [추정]/[정보 없음]), 문화/가치 등.",
    "- values: 회사가 중요시하는 가치나 문화(알려진 범위).",
    "- hiring_focus: JD에서 흔히 강조되는 역량/경험 포인트.",
    "- resume_tips: 지원서(자소서/이력서) 작성 시 적용 가능한 팁(행동지표, 수치화 등).",
    "- interview_tips: 선택 항목.",
  ].join("\n");

  const user = [
    `회사명: ${company}`,
    role ? `지원 포지션: ${role}` : "",
    "",
    "요구사항:",
    "- 2~3문장 blurb: 회사 핵심 소개, 산업/제품/차별점.",
    "- bullets 4~6개.",
    "- values/hiring_focus/resume_tips/interview_tips 포함.",
    "- 실존 고유명사·날짜 임의 창작 금지, 불확실하면 [대괄호] 처리.",
    "- JSON만 출력.",
  ].join("\n");

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" as const },
  });

  const raw = res.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
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

  const values: string[] =
    Array.isArray(parsed?.values) ? parsed.values.map((x: any) => String(x)) : [];

  const hiringFocus: string[] =
    Array.isArray(parsed?.hiring_focus) ? parsed.hiring_focus.map((x: any) => String(x)) : [];

  const resumeTips: string[] =
    Array.isArray(parsed?.resume_tips) ? parsed.resume_tips.map((x: any) => String(x)) : [];

  const interviewTips: string[] =
    Array.isArray(parsed?.interview_tips) ? parsed.interview_tips.map((x: any) => String(x)) : [];

  return {
    company,
    role: role ?? undefined,
    blurb,
    bullets,
    values,
    hiringFocus,
    resumeTips,
    interviewTips,
    updatedAt: new Date().toISOString(),
  };
}

/** =========================
 *  ✅ DB 캐시 조회 또는 새로 생성 (+ 확장 섹션/뉴스 병합)
 *  - DB 스키마는 blurb/bullets만 저장.
 *  - values/hiringFocus/resumeTips/interviewTips/recent 은 응답에만 포함(비저장).
 *  ========================= */
export async function fetchCompanyBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const key = { company: company.trim(), role: (role ?? null)?.trim?.() || null };

  // 1) 기존 데이터 조회
  const found = await prisma.companyBrief.findUnique({
    where: { company_role: key },
  });

  // 2) TTL 만료 시 새로 생성 (OpenAI)
  let base: CompanyBrief | null = null;
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

      base = {
        company: saved.company,
        role: saved.role ?? undefined,
        blurb: saved.blurb,
        bullets: (saved.bullets as any[])?.map(String) ?? [],
        updatedAt: saved.updatedAt.toISOString(),
      };
    } catch (e) {
      console.error("[companyBrief] refresh error:", e);
      // 실패 시: 기존 캐시가 있으면 그것으로 복구
      if (found) {
        base = {
          company: found.company,
          role: found.role ?? undefined,
          blurb: found.blurb,
          bullets: (found.bullets as any[])?.map(String) ?? [],
          updatedAt: found.updatedAt.toISOString(),
        };
      } else {
        base = {
          company: key.company,
          role: key.role ?? undefined,
          blurb: `${key.company} 관련 요약을 불러오지 못했습니다.`,
          bullets: ["• [정보 없음]"],
          updatedAt: new Date().toISOString(),
        };
      }
    }
  } else {
    // 3) 최신 캐시 그대로 사용
    base = {
      company: found.company,
      role: found.role ?? undefined,
      blurb: found.blurb,
      bullets: (found.bullets as any[])?.map(String) ?? [],
      updatedAt: found.updatedAt.toISOString(),
    };
  }

  // 4) 확장 섹션 생성 (메모리 전용) + 실시간 뉴스 병합
  if (ENABLE_ENRICH) {
    try {
      // OpenAI로 확장 섹션 생성 (values/hiringFocus/resumeTips/interviewTips)
      const enrich = await generateBrief(base.company, base.role);
      base.values = enrich.values;
      base.hiringFocus = enrich.hiringFocus;
      base.resumeTips = enrich.resumeTips;
      base.interviewTips = enrich.interviewTips;
    } catch (e) {
      console.warn("[companyBrief] enrich generation failed:", e);
    }
  }

  // 5) 실시간 뉴스가 가능하면 recent 병합 (키 없으면 skip)
  try {
    const live = await fetchCompanyNews(base.company);
    if (live.length > 0) {
      const dedup = new Map<string, BriefNews>();
      live.forEach((n) => {
        const k = `${n.title}|${n.url ?? ""}`;
        if (!dedup.has(k)) dedup.set(k, n);
      });
      base.recent = Array.from(dedup.values());
    }
  } catch (e) {
    console.warn("[companyBrief] news fetch failed:", e);
  }

  return base;
}

/** =========================
 *  ✅ 강제 재생성(캐시 무시) API
 *  - 캐시와 TTL을 무시하고 최신 생성 결과를 저장·반환
 *  - values/hiringFocus/resumeTips/interviewTips/recent 도 포함
 *  ========================= */
export async function refreshCompanyBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const key = { company: company.trim(), role: (role ?? null)?.trim?.() || null };

  // 1) 새로 생성 (기본 요약)
  const fresh = await generateBrief(key.company, key.role ?? undefined);

  // 2) DB 저장(기존 스키마 유지)
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

  // 3) 반환 객체 기본값
  const base: CompanyBrief = {
    company: saved.company,
    role: saved.role ?? undefined,
    blurb: saved.blurb,
    bullets: (saved.bullets as any[])?.map(String) ?? [],
    updatedAt: saved.updatedAt.toISOString(),
  };

  // 4) 확장 섹션(가치/채용포인트/팁) 생성 (환경변수에 따라)
  if (ENABLE_ENRICH) {
    try {
      const enrich = await generateBrief(base.company, base.role);
      base.values = enrich.values;
      base.hiringFocus = enrich.hiringFocus;
      base.resumeTips = enrich.resumeTips;
      base.interviewTips = enrich.interviewTips;
    } catch (e) {
      console.warn("[companyBrief] enrich generation failed:", e);
    }
  }

  // 5) 실시간 뉴스 병합 (키 있으면)
  try {
    const live = await fetchCompanyNews(base.company);
    if (live.length > 0) {
      const dedup = new Map<string, BriefNews>();
      live.forEach((n) => {
        const k = `${n.title}|${n.url ?? ""}`;
        if (!dedup.has(k)) dedup.set(k, n);
      });
      base.recent = Array.from(dedup.values());
    }
  } catch (e) {
    console.warn("[companyBrief] news fetch failed:", e);
  }

  return base;
}

/** =========================
 *  ✅ 최근 업데이트된 회사 요약 목록
 *  (기존 스키마 유지: blurb/bullets만)
 *  ========================= */
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
    // 확장 필드는 목록 API에서는 생략(요청시 fetchCompanyBrief/refreshCompanyBrief 사용)
    updatedAt: r.updatedAt.toISOString(),
  }));
}
