"use server";

/**
 * companyBrief.ts — 근거(Evidence) 기반 요약 템플릿
 * - 핵심: 출처 없는 항목은 생성/표시하지 않거나(STRICT) 명확히 경고
 * - 어디서 채웠는지(sourceNotes, recent[].source/url/date) 반드시 유지
 * - 최소한의 메모리 캐시 포함(실서비스는 DB로 교체)
 */

export type CompanyBrief = {
  company: string;
  role?: string | null;

  // 본문 요약
  blurb?: string | null;
  bullets?: string[];                 // 핵심 요약 불릿

  // 가치·문화·인재상
  values?: string[];
  culture?: string[];
  talentTraits?: string[];

  // 채용 포인트 / 팁
  hiringFocus?: string[];
  resumeTips?: string[];
  interviewTips?: string[];

  // 뉴스/출처
  recent?: { title: string; url?: string; source?: string; date?: string }[];
  sourceNotes?: string[];             // “공식 홈페이지 About, 2024-xx-xx 채용공고, 연차보고서 …” 등 서술식 출처
  updatedAt: string;                  // ISO date
};

type RefreshOpts =
  | {
      role?: string | null;
      section?: "basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news";
      strict?: boolean;
      /** 블로그/커뮤니티(비공식) 포함 여부 — true면 보조 출처로 함께 수집 */
      includeCommunity?: boolean;
    }
  | undefined;

/* ============================================================
   캐시 (데모용) — 프로덕션에선 DB/Prisma로 교체
============================================================ */
const mem = new Map<string, CompanyBrief>();
// ⛏️ 오타 수정: 마지막에 누락된 "}" 추가
const keyOf = (c: string, r?: string | null) => `${c.toLowerCase()}::${(r ?? "").toLowerCase()}`;

/* ============================================================
   퍼블릭 API (UI가 호출)
============================================================ */

/** 최근 편집 목록 (프로덕션: DB ORDER BY updated_at DESC LIMIT n) */
export async function listRecentCompanyBriefs(n = 8): Promise<CompanyBrief[]> {
  const all = Array.from(mem.values()).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  return all.slice(0, n);
}

/** 캐시/DB에서 로드 (없으면 빈 틀 반환) */
export async function fetchCompanyBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const k = keyOf(company, role);
  const cached = mem.get(k);
  if (cached) return clone(cached);

  // TODO: DB에서 로드 시도
  // const row = await prisma.company_brief.findUnique(...)

  // 없으면 빈 골격
  const empty: CompanyBrief = {
    company,
    role: role ?? null,
    blurb: "",
    bullets: [],
    values: [],
    culture: [],
    talentTraits: [],
    hiringFocus: [],
    resumeTips: [],
    interviewTips: [],
    recent: [],
    sourceNotes: [],
    updatedAt: new Date().toISOString(),
  };
  mem.set(k, empty);
  return clone(empty);
}

/**
 * 강제 재생성(섹션별) — 반드시 “근거 기반”으로만 채움
 * - strict=true: 출처 없는 항목은 비워둠
 * - strict=false: 출처가 없는 텍스트는 `[출처 불명]` 태그를 달아 경고
 */
export async function refreshCompanyBrief(
  company: string,
  opts?: RefreshOpts
): Promise<CompanyBrief> {
  const role = opts?.role ?? null;
  const strict = opts?.strict ?? true;
  const section = opts?.section;
  const includeCommunity = !!opts?.includeCommunity;

  // 1) 기존 결과 불러오기
  const current = await fetchCompanyBrief(company, role);

  // 2) 자료 수집 (크롤링/검색/문서) — 반드시 “출처”를 함께 수집
  const evidence = await collectEvidence(company, role, { includeCommunity });

  // 3) 섹션별 요약 생성(근거 전달)
  const next = clone(current);
  if (!section || section === "basic") {
    const { blurb, bullets, sourceNotes } = await summarizeBasic(company, role, evidence, { strict });
    next.blurb = blurb;
    next.bullets = bullets;
    next.sourceNotes = mergeUnique(next.sourceNotes, sourceNotes);
  }
  if (!section || section === "valuesCultureTalent") {
    const { values, culture, talentTraits, sourceNotes } = await summarizeValuesCultureTalent(company, role, evidence, { strict });
    next.values = values;
    next.culture = culture;
    next.talentTraits = talentTraits;
    next.sourceNotes = mergeUnique(next.sourceNotes, sourceNotes);
  }
  if (!section || section === "hiringPoints") {
    const { hiringFocus, sourceNotes } = await summarizeHiringPoints(company, role, evidence, { strict });
    next.hiringFocus = hiringFocus;
    next.sourceNotes = mergeUnique(next.sourceNotes, sourceNotes);
  }
  if (!section || section === "tips") {
    const { resumeTips, interviewTips, sourceNotes } = await summarizeTips(company, role, evidence, { strict });
    next.resumeTips = resumeTips;
    next.interviewTips = interviewTips;
    next.sourceNotes = mergeUnique(next.sourceNotes, sourceNotes);
  }
  if (!section || section === "news") {
    next.recent = await summarizeNews(company, evidence, { strict });
  }

  // 4) 정리 & 검증: 출처 없이 남은 텍스트 제거(STRICT) 또는 태깅
  sanitizeBriefInPlace(next, { strict });

  next.updatedAt = new Date().toISOString();

  // 5) 저장 (프로덕션: DB upsert)
  const k = keyOf(company, role);
  mem.set(k, next);

  return clone(next);
}

/* ============================================================
   수집/요약 레이어 (템플릿)
============================================================ */

/** 근거 모음 */
type Evidence = {
  aboutPages: Array<{ text: string; url: string; source: string }>;
  careerPages: Array<{ text: string; url: string; source: string }>;
  jobPosts: Array<{ text: string; url: string; source: string; date?: string }>;
  reports: Array<{ text: string; url: string; source: string; date?: string }>;
  news: Array<{ title: string; url: string; source: string; date?: string }>;
};

/** 회사별 자료 수집 */
async function collectEvidence(
  company: string,
  role?: string | null,
  opts?: { includeCommunity?: boolean }
): Promise<Evidence> {
  const out: Evidence = {
    aboutPages: [],
    careerPages: [],
    jobPosts: [],
    reports: [],
    news: [],
  };

  // --- 0) 유틸/환경
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  const hasNaver = !!(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET);

  const safeFetchJson = async (url: string, init?: RequestInit & { timeoutMs?: number }) => {
    const { timeoutMs = 8000, ...rest } = init || {};
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ac.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const hostFromUrl = (u?: string) => {
    try {
      if (!u) return "";
      const { hostname } = new URL(u);
      return hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  // --- 1) 뉴스 (항상 시도)
  if (hasNaver) {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", company);
      url.searchParams.set("display", "20");
      url.searchParams.set("sort", "date");

      const data = await safeFetchJson(url.toString(), {
        headers: {
          "X-Naver-Client-Id": NAVER_CLIENT_ID,
          "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        },
        timeoutMs: 7000,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      out.news.push(
        ...items.map((it: any) => {
          const title = String(it?.title || "").replace(/<[^>]+>/g, "");
          const link = String(it?.link || "");
          const source = hostFromUrl(link) || "Naver News";
          const date = it?.pubDate ? new Date(it.pubDate).toISOString() : undefined;
          return { title, url: link, source, date };
        })
      );
    } catch (e) {
      console.warn("[companyBrief] Naver news fetch failed:", (e as Error).message);
    }
  } else {
    console.warn("[companyBrief] NAVER_CLIENT_ID/SECRET not set — skipping news.");
  }

  // --- 2) 블로그/커뮤니티 (옵션)
  if (opts?.includeCommunity && hasNaver) {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/blog.json");
      url.searchParams.set("query", company);
      url.searchParams.set("display", "15");
      url.searchParams.set("sort", "date");

      const data = await safeFetchJson(url.toString(), {
        headers: {
          "X-Naver-Client-Id": NAVER_CLIENT_ID,
          "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        },
        timeoutMs: 7000,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      out.news.push(
        ...items.map((it: any) => {
          const title = String(it?.title || "").replace(/<[^>]+>/g, "");
          const link = String(it?.link || "");
          const source = hostFromUrl(link) || "Naver Blog";
          const date = it?.postdate
            ? new Date(
                `${String(it.postdate).slice(0, 4)}-${String(it.postdate).slice(4, 6)}-${String(
                  it.postdate
                ).slice(6, 8)}T00:00:00Z`
              ).toISOString()
            : undefined;
          return { title, url: link, source, date };
        })
      );
    } catch (e) {
      console.warn("[companyBrief] Naver blog fetch failed:", (e as Error).message);
    }
  }

  // --- 3) (선택) 공식 페이지/IR/채용공고/리포트 — 필요 시 여기에 확장
  // - 이 부분은 도메인/역할별 크롤러 붙일 영역입니다. 현재는 빈 배열 유지.

  return out;
}

/** 공통: 근거 합치기(문자열들만 뽑아 요약에 건네기) */
function flattenTexts(list: Array<{ text: string }>) {
  return list.map((x) => x.text).filter(Boolean).join("\n\n");
}

/** (STRICT) 출처 있는 문장만 반환하도록 강제하는 요약기 — 실제 모델 연결 지점 */
async function summarizeWithModel(
  instruction: string,
  corpus: string,
  _opts: { strict: boolean }
): Promise<string[]> {
  // TODO: OpenAI 등 모델 호출부 연결
  // - 시스템 프롬프트 예:
  //   “You must only use facts explicitly present in the provided sources. If a point is not present, output NOTHING.”
  // 데모: 빈 배열 반환(출처 없으면 아무것도 생성하지 않음)
  if (!corpus.trim()) return [];
  // 임시: 1줄 요약 흉내(실제 서비스에선 모델 응답 파싱)
  return instruction ? [instruction.slice(0, 40) + "…"] : [corpus.slice(0, 80) + "…"];
}

/** 섹션: 기본 요약 */
async function summarizeBasic(
  _company: string,
  _role: string | null | undefined,
  ev: Evidence,
  { strict }: { strict: boolean }
) {
  const corpus = [flattenTexts(ev.aboutPages), flattenTexts(ev.reports)].join("\n\n");
  const bullets = await summarizeWithModel("회사 핵심 요약을 최대 5개 불릿으로 작성", corpus, { strict });
  const blurbArr = await summarizeWithModel("두 문장으로 한 문단 요약", corpus, { strict });
  const blurb = blurbArr[0] ?? "";
  const sourceNotes = gatherSources([ev.aboutPages, ev.reports]);
  return { blurb, bullets, sourceNotes };
}

/** 섹션: 가치/문화/인재상 */
async function summarizeValuesCultureTalent(
  _company: string,
  _role: string | null | undefined,
  ev: Evidence,
  { strict }: { strict: boolean }
) {
  const corpus = [flattenTexts(ev.aboutPages), flattenTexts(ev.careerPages), flattenTexts(ev.reports)].join("\n\n");
  const values = await summarizeWithModel("‘핵심 가치’ 목록만 추출", corpus, { strict });
  const culture = await summarizeWithModel("‘조직문화’ 항목만 추출", corpus, { strict });
  const talentTraits = await summarizeWithModel("‘인재상’ 항목만 추출", corpus, { strict });
  const sourceNotes = gatherSources([ev.aboutPages, ev.careerPages, ev.reports]);
  return { values, culture, talentTraits, sourceNotes };
}

/** 섹션: 채용 포인트 */
async function summarizeHiringPoints(
  _company: string,
  _role: string | null | undefined,
  ev: Evidence,
  { strict }: { strict: boolean }
) {
  const corpus = [flattenTexts(ev.jobPosts), flattenTexts(ev.careerPages)].join("\n\n");
  const hiringFocus = await summarizeWithModel("채용에서 중요하게 보는 포인트만 추출", corpus, { strict });
  const sourceNotes = gatherSources([ev.jobPosts, ev.careerPages]);
  return { hiringFocus, sourceNotes };
}

/** 섹션: 팁 */
async function summarizeTips(
  _company: string,
  _role: string | null | undefined,
  ev: Evidence,
  { strict }: { strict: boolean }
) {
  const corpus = [flattenTexts(ev.jobPosts), flattenTexts(ev.careerPages)].join("\n\n");
  const resumeTips = await summarizeWithModel("서류 팁을 ‘- ’ 불릿으로", corpus, { strict });
  const interviewTips = await summarizeWithModel("면접 팁을 ‘- ’ 불릿으로", corpus, { strict });
  const sourceNotes = gatherSources([ev.jobPosts, ev.careerPages]);
  return { resumeTips, interviewTips, sourceNotes };
}

/** 섹션: 뉴스(이미 출처형식이라 필터만 적용) */
async function summarizeNews(
  _company: string,
  ev: Evidence,
  { strict }: { strict: boolean }
) {
  const items = (ev.news || []).filter((n) => n.title && (n.url || n.source));
  // STRICT: 출처 없는 뉴스 제외
  return strict ? items.filter((n) => n.url || n.source) : items;
}

/* ============================================================
   후처리/검증
============================================================ */

/** 출처 문자열 묶음 만들기 */
function gatherSources(groups: Array<Array<{ url?: string; source?: string }>>): string[] {
  const bag = new Set<string>();
  for (const g of groups) {
    for (const x of g || []) {
      const s = x.source || x.url;
      if (s) bag.add(s);
    }
  }
  return Array.from(bag);
}

/** STRICT: 출처 없는 텍스트 제거 / LOOSE: 경고 태그 */
function sanitizeBriefInPlace(brief: CompanyBrief, { strict }: { strict: boolean }) {
  const hasAnySource = (brief.sourceNotes && brief.sourceNotes.length > 0) || (brief.recent && brief.recent.length > 0);

  const clean = (arr?: string[]) =>
    (arr || []).map((s) => s.trim()).filter(Boolean);

  // 기본
  brief.bullets = clean(brief.bullets);
  brief.values = clean(brief.values);
  brief.culture = clean(brief.culture);
  brief.talentTraits = clean(brief.talentTraits);
  brief.hiringFocus = clean(brief.hiringFocus);
  brief.resumeTips = clean(brief.resumeTips);
  brief.interviewTips = clean(brief.interviewTips);

  if (strict && !hasAnySource) {
    // 출처가 전혀 없으면 본문성 텍스트를 비운다.
    brief.blurb = "";
    brief.bullets = [];
    brief.values = [];
    brief.culture = [];
    brief.talentTraits = [];
    brief.hiringFocus = [];
    brief.resumeTips = [];
    brief.interviewTips = [];
  } else if (!strict && !hasAnySource) {
    // 느슨 모드: 경고 태그 부착
    const tag = (s: string) => (s.endsWith(" [출처 불명]") ? s : `${s} [출처 불명]`);
    brief.blurb = brief.blurb ? tag(brief.blurb) : "";
    brief.bullets = (brief.bullets || []).map(tag);
    brief.values = (brief.values || []).map(tag);
    brief.culture = (brief.culture || []).map(tag);
    brief.talentTraits = (brief.talentTraits || []).map(tag);
    brief.hiringFocus = (brief.hiringFocus || []).map(tag);
    brief.resumeTips = (brief.resumeTips || []).map(tag);
    brief.interviewTips = (brief.interviewTips || []).map(tag);
  }
}

/* ============================================================
   유틸
============================================================ */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}
function mergeUnique(a: string[] | undefined, b: string[] | undefined) {
  const s = new Set<string>([...(a || []), ...(b || [])].map((x) => (x || "").trim()).filter(Boolean));
  return Array.from(s);
}
