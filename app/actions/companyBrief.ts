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

/** (옵션) 문화/인재상 원문 스니펫 프록시(없으면 건너뜀) */
const CULTURE_API_ENDPOINT = process.env.CULTURE_API_ENDPOINT; // 예: /api/culture
const CULTURE_API_KEY = process.env.CULTURE_API_KEY;

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
  values?: string[];         // 회사 핵심 가치
  culture?: string[];        // 조직문화/일하는 방식
  talentTraits?: string[];   // 인재상(태도/역량 키워드)
  hiringFocus?: string[];    // JD에서 강조되는 역량/경험
  resumeTips?: string[];     // 서류 합격 꿀팁
  interviewTips?: string[];  // 면접 팁
  recent?: BriefNews[];      // 최근 이슈/뉴스
  sourceNotes?: string[];    // 참고 출처(도메인·페이지명 등)

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
 *  서버에서 절대 URL 베이스 결정
 *  - 상대경로('/api/news', '/api/culture')도 안전하게 동작
 *  ========================= */
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL; // 예: https://speccloud.app
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;        // 예: https://your-app.vercel.app
  return "http://localhost:3000"; // 로컬 개발 기본값
}

/** =========================
 *  (옵션) 실시간 뉴스 조회
 *  - 키 없으면 빈 배열 반환
 *  - 사용하는 외부 뉴스 API 응답 구조에 맞춰 아래 매핑만 조정
 *  ========================= */
async function fetchCompanyNews(company: string): Promise<BriefNews[]> {
  if (!NEWS_API_ENDPOINT || !NEWS_API_KEY) return [];
  try {
    const base = NEWS_API_ENDPOINT.startsWith("http") ? "" : getBaseUrl();
    const url = `${base}${NEWS_API_ENDPOINT}?q=${encodeURIComponent(company)}&count=5`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${NEWS_API_KEY}` },
      cache: "no-store",
      // next: { revalidate: 10800 } // 필요 시 캐시
    });

    if (!res.ok) {
      console.error("[news] provider not ok", res.status);
      return [];
    }
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
  } catch (e) {
    console.error("[news] fetch error", e);
    return [];
  }
}

/** =========================
 *  (옵션) 문화/인재상 스니펫 수집
 *  - 프록시가 회사 공식 페이지(about/culture/careers)를 긁어
 *    텍스트/도메인 배열을 표준 포맷으로 반환한다고 가정
 *  - 프록시가 없으면 건너뜀 (LLM-only로 동작)
 *  ========================= */
async function fetchCultureSignals(company: string): Promise<{ texts: string[]; sources: string[] }> {
  if (!CULTURE_API_ENDPOINT || !CULTURE_API_KEY) return { texts: [], sources: [] };
  try {
    const base = CULTURE_API_ENDPOINT.startsWith("http") ? "" : getBaseUrl();
    const url = `${base}${CULTURE_API_ENDPOINT}?q=${encodeURIComponent(company)}&limit=3`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CULTURE_API_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[culture] provider not ok", res.status);
      return { texts: [], sources: [] };
    }
    const data = await res.json();
    const texts: string[] = Array.isArray(data?.snippets) ? data.snippets.map(String) : [];
    const sources: string[] = Array.isArray(data?.sources) ? data.sources.map(String) : [];
    return { texts, sources };
  } catch (e) {
    console.warn("[culture] fetch error", e);
    return { texts: [], sources: [] };
  }
}

/** =========================
 *  OpenAI 호출 → 확장 브리프 생성(JSON 엄격)
 *  - DB에는 blurb/bullets만 저장, 나머지는 응답으로만 전달
 *  - 증거 텍스트가 있으면 그 범위 내에서만 요약(환각 최소화)
 *  ========================= */
async function generateBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  // (옵션) 문화/인재상 근거 수집
  const { texts: cultureTexts, sources: cultureSources } = await fetchCultureSignals(company);

  const sys = [
    "You are a careful assistant that prepares concise Korean company briefs for job applicants.",
    "Always write in Korean.",
    "If evidence texts are provided, DO NOT invent facts beyond them.",
    "When uncertain, use bracketed placeholders like [연도], [X명], [수치?].",
    "Output strictly in JSON.",
  ].join("\n");

  const reqLines = [
    `회사명: ${company}`,
    role ? `지원 포지션: ${role}` : "",
    "",
    "요구사항:",
    "- blurb: 회사 핵심 2~3문장.",
    "- bullets: 4~6개 (제품/고객/차별점/최근 전략·지표/문화).",
    "- values: 3~6개 (핵심가치 키워드).",
    "- culture: 3~6개 (일하는 방식/복지/소통/제도).",
    "- talent_traits: 3~6개 (인재상 키워드, 태도/역량).",
    "- hiring_focus: 3~6개 (JD에서 자주 강조).",
    "- resume_tips, interview_tips: 각 2~4개.",
    "- source_notes: 참고한 출처(도메인 또는 페이지 이름) 1~4개.",
    "- 실존 고유명사·날짜 임의 창작 금지. 불확실하면 [대괄호].",
    "- JSON 키: company, role, blurb, bullets, values, culture, talent_traits, hiring_focus, resume_tips, interview_tips, source_notes",
  ];

  const evidence = cultureTexts.length
    ? [
        "",
        "[증거 텍스트 시작]",
        ...cultureTexts.map((t, i) => `(${i + 1}) ${t}`),
        "[증거 텍스트 끝]",
        cultureSources.length ? `참고 출처: ${cultureSources.join(", ")}` : "",
        "",
        "위 증거 범위 내에서 요약하세요. 증거에 없는 내용은 [정보 부족] 또는 [추정] 표기.",
      ].join("\n")
    : "";

  const user = [reqLines.join("\n"), evidence].filter(Boolean).join("\n");

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: cultureTexts.length ? 0.1 : 0.2, // 증거 있으면 더 보수적
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

  const values: string[] = Array.isArray(parsed?.values) ? parsed.values.map(String) : [];
  const culture: string[] = Array.isArray(parsed?.culture) ? parsed.culture.map(String) : [];
  const talentTraits: string[] = Array.isArray(parsed?.talent_traits) ? parsed.talent_traits.map(String) : [];
  const hiringFocus: string[] = Array.isArray(parsed?.hiring_focus) ? parsed.hiring_focus.map(String) : [];
  const resumeTips: string[] = Array.isArray(parsed?.resume_tips) ? parsed.resume_tips.map(String) : [];
  const interviewTips: string[] = Array.isArray(parsed?.interview_tips) ? parsed.interview_tips.map(String) : [];
  const sourceNotes: string[] = Array.isArray(parsed?.source_notes) ? parsed.source_notes.map(String) : cultureSources;

  return {
    company,
    role: role ?? undefined,
    blurb,
    bullets,
    values,
    culture,
    talentTraits,
    hiringFocus,
    resumeTips,
    interviewTips,
    sourceNotes,
    updatedAt: new Date().toISOString(),
  };
}

/** =========================
 *  ✅ DB 캐시 조회 또는 새로 생성 (+ 확장 섹션/뉴스 병합)
 *  - DB 스키마는 blurb/bullets만 저장.
 *  - values/culture/talentTraits/hiringFocus/resumeTips/interviewTips/recent/sourceNotes 은 응답에만 포함(비저장).
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
      // OpenAI로 확장 섹션 생성 (values/culture/talentTraits/hiringFocus/resumeTips/interviewTips/sourceNotes)
      const enrich = await generateBrief(base.company, base.role);
      base.values = enrich.values;
      base.culture = enrich.culture;
      base.talentTraits = enrich.talentTraits;
      base.hiringFocus = enrich.hiringFocus;
      base.resumeTips = enrich.resumeTips;
      base.interviewTips = enrich.interviewTips;
      base.sourceNotes = enrich.sourceNotes;
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
 *  - 확장 필드도 포함하여 반환
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

  // 4) 확장 섹션(가치/문화/인재상/채용포인트/팁/출처) 생성 (환경변수에 따라)
  if (ENABLE_ENRICH) {
    try {
      const enrich = await generateBrief(base.company, base.role);
      base.values = enrich.values;
      base.culture = enrich.culture;
      base.talentTraits = enrich.talentTraits;
      base.hiringFocus = enrich.hiringFocus;
      base.resumeTips = enrich.resumeTips;
      base.interviewTips = enrich.interviewTips;
      base.sourceNotes = enrich.sourceNotes;
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
