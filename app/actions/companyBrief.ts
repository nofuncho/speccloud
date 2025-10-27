"use server";

/**
 * companyBrief.ts — 근거(Evidence) 기반 요약 템플릿 + 실제 수집(OpenAI/네이버)
 * - STRICT: 출처 텍스트에 없는 내용은 생성 금지
 * - includeCommunity(혼합): 블로그/커뮤니티도 보조 코퍼스로 사용
 */

import OpenAI from "openai";
import { once } from "@/app/lib/fetchGuard";
import {
  hasNaver,
  naverJson,
  naverHeaders,
  stripTags,
  fetchTextFromUrl,
  hostFromUrl,
} from "@/app/lib/naver";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const oai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export type CompanyBrief = {
  company: string;
  role?: string | null;

  blurb?: string | null;
  bullets?: string[];

  values?: string[];
  culture?: string[];
  talentTraits?: string[];

  hiringFocus?: string[];
  resumeTips?: string[];
  interviewTips?: string[];

  recent?: { title: string; url?: string; source?: string; date?: string }[];
  sourceNotes?: string[];
  updatedAt: string;
};

type RefreshOpts =
  | {
      role?: string | null;
      section?: "basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news";
      strict?: boolean;
      includeCommunity?: boolean;
      manualUrls?: string[]; // 필요 시 특정 페이지 강제 주입
    }
  | undefined;

/* ============================================================
   캐시(데모) — 프로덕션에선 DB 테이블로 교체
============================================================ */
const mem = new Map<string, CompanyBrief>();
const keyOf = (c: string, r?: string | null) => `${c.toLowerCase()}::${(r ?? "").toLowerCase()}`;

export async function listRecentCompanyBriefs(n = 8): Promise<CompanyBrief[]> {
  const all = Array.from(mem.values()).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  return all.slice(0, n);
}

export async function fetchCompanyBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const k = keyOf(company, role);
  const cached = mem.get(k);
  if (cached) return clone(cached);
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

/** 강제 재생성(섹션별) */
export async function refreshCompanyBrief(company: string, opts?: RefreshOpts): Promise<CompanyBrief> {
  const role = opts?.role ?? null;
  const strict = opts?.strict ?? true;
  const section = opts?.section;

  const current = await fetchCompanyBrief(company, role);

  // in-flight dedupe: 같은 요청 중복 방지
  const cacheKey = `brief:${company.toLowerCase()}::${section || "all"}::${role || ""}::${strict ? "O" : "M"}`;
  const next = await once(cacheKey, async () => {
    const evidence = await collectEvidence(company, role, {
      includeCommunity: !!opts?.includeCommunity,
      manualUrls: opts?.manualUrls,
    });

    const draft = clone(current);

    if (!section || section === "basic") {
      const { blurb, bullets, sourceNotes } = await summarizeBasic(company, role, evidence, { strict });
      draft.blurb = blurb;
      draft.bullets = bullets;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "valuesCultureTalent") {
      const { values, culture, talentTraits, sourceNotes } = await summarizeValuesCultureTalent(company, role, evidence, {
        strict,
      });
      draft.values = values;
      draft.culture = culture;
      draft.talentTraits = talentTraits;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "hiringPoints") {
      const { hiringFocus, sourceNotes } = await summarizeHiringPoints(company, role, evidence, { strict });
      draft.hiringFocus = hiringFocus;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "tips") {
      const { resumeTips, interviewTips, sourceNotes } = await summarizeTips(company, role, evidence, { strict });
      draft.resumeTips = resumeTips;
      draft.interviewTips = interviewTips;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "news") {
      draft.recent = await summarizeNews(company, evidence, { strict });
    }

    sanitizeBriefInPlace(draft, { strict });
    draft.updatedAt = new Date().toISOString();

    const k = keyOf(company, role);
    mem.set(k, draft);
    return draft;
  });

  return clone(next);
}

/* ============================================================
   수집 레이어
============================================================ */
type Evidence = {
  aboutPages: Array<{ text: string; url: string; source: string }>;
  careerPages: Array<{ text: string; url: string; source: string }>;
  jobPosts: Array<{ text: string; url: string; source: string; date?: string }>;
  reports: Array<{ text: string; url: string; source: string; date?: string }>;
  news: Array<{ title: string; url: string; source: string; date?: string }>;
};

// ==== 교체: 수집기 (빠르고 안정적으로 바꿈)
async function collectEvidence(
  company: string,
  role?: string | null,
  opts?: { includeCommunity?: boolean; manualUrls?: string[] }
): Promise<Evidence> {
  const out: Evidence = { aboutPages: [], careerPages: [], jobPosts: [], reports: [], news: [] };

  // --- 타임박스 & 병렬 풀 유틸
  const deadline = Date.now() + 6000; // ⏱ 전체 타임박스 6초
  const timeLeft = () => Math.max(0, deadline - Date.now());

  const withBudget = async <T>(fn: () => Promise<T>, fallback: T) => {
    if (timeLeft() <= 0) return fallback;
    try { return await fn(); } catch { return fallback; }
  };

  const runPool = async <T>(jobs: Array<() => Promise<T>>, limit = 6): Promise<T[]> => {
    const results: T[] = [];
    let i = 0, running = 0;
    return await new Promise<T[]>((resolve) => {
      const kick = () => {
        if (results.length >= jobs.length) return resolve(results);
        while (running < limit && i < jobs.length) {
          const idx = i++;
          running++;
          jobs[idx]().then((v) => results[idx] = v as any)
            .catch(() => (results[idx] = undefined as any))
            .finally(() => { running--; kick(); });
        }
        if (i >= jobs.length && running === 0) resolve(results);
      };
      kick();
    });
  };

  const pushIfText = (bucket: keyof Evidence, text: string, url: string) => {
    if (!text || text.length < 400) return; // 너무 짧으면 잡음으로 간주
    const source = hostFromUrl(url) || "web";
    (out[bucket] as any).push({ text, url, source });
  };

  // --- (0) 뉴스: 리스트 전용(가벼움) — 먼저 빠르게 채움
  if (hasNaver) {
    await withBudget(async () => {
      const u = new URL("https://openapi.naver.com/v1/search/news.json");
      u.searchParams.set("query", company);
      u.searchParams.set("display", "15");
      u.searchParams.set("sort", "date");
      const data = await naverJson(u.toString());
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      out.news.push(
        ...items.map((it: any) => ({
          title: String(it?.title || "").replace(/<[^>]+>/g, ""),
          url: String(it?.link || ""),
          source: hostFromUrl(String(it?.link || "")) || "Naver News",
          date: it?.pubDate ? new Date(it.pubDate).toISOString() : undefined,
        }))
      );
    }, undefined as any);
  }

  // --- (1) 후보 URL 만들기 (공식 도메인 휴리스틱 + webkr)
  const guessDomains = (name: string): string[] => {
    const n = name.replace(/[^a-zA-Z0-9가-힣.\s-]/g, " ").replace(/\s+/g, " ").trim();
    const stems = [n, n.replace(/\s+/g, ""), n.replace(/\s+/g, "-"), n.replace(/\s+/g, "").toLowerCase()];
    const tlds = [".co.kr", ".com", ".kr"];
    const hosts = new Set<string>();
    stems.forEach((s) => tlds.forEach((t) => hosts.add(`https://${s}${t}`)));
    return Array.from(hosts);
  };

  const candidateRoots = guessDomains(company);
  const tryPaths = ["/about", "/company", "/careers", "/jobs", "/recruit", "/culture", "/values", "/mission", "/vision"];

  const rootUrls: string[] = [];
  candidateRoots.forEach((root) => tryPaths.forEach((p) => rootUrls.push(root + p)));

  let webUrls: string[] = [];
  if (hasNaver && timeLeft() > 0) {
    await withBudget(async () => {
      const webkr = new URL("https://openapi.naver.com/v1/search/webkr.json");
      webkr.searchParams.set("query", `${company} (회사 소개|핵심가치|조직문화|채용|careers|recruit)`);
      webkr.searchParams.set("display", "10"); // 상위 10개로 제한
      webkr.searchParams.set("sort", "sim");
      const data = await naverJson(webkr.toString());
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      webUrls = items.map((it: any) => String(it?.link || it?.url || "")).filter(Boolean);
    }, undefined as any);
  }

  const manual = opts?.manualUrls || [];
  const allCandidates = Array.from(new Set<string>([...manual, ...rootUrls, ...webUrls])).slice(0, 24); // 총 24개 제한

  // --- (2) 실제 본문 수집: 병렬 + 개별 타임아웃
  const jobs = allCandidates.map((url) => async () => {
    if (timeLeft() <= 0) return;
    const text = await fetchTextFromUrl(url, Math.min(3000, timeLeft())); // 개별 3s 제한
    if (!text) return;
    if (/jobs?|recruit|careers/i.test(url)) pushIfText("careerPages", text, url);
    else if (/culture|values|mission|vision/i.test(url)) pushIfText("aboutPages", text, url);
    else pushIfText("aboutPages", text, url);
  });

  await runPool(jobs, 6);

  // --- (3) 혼합 모드: 블로그를 보조 코퍼스로(빠르게)
  if (opts?.includeCommunity && hasNaver && timeLeft() > 0) {
    await withBudget(async () => {
      const u = new URL("https://openapi.naver.com/v1/search/blog.json");
      u.searchParams.set("query", company);
      u.searchParams.set("display", "8");     // 상위 8개로만
      u.searchParams.set("sort", "date");
      const data = await naverJson(u.toString());
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      out.reports.push(
        ...items.map((it: any) => {
          const title = stripTags(it?.title || "");
          const desc = stripTags(it?.description || "");
          const text = [title, desc].filter(Boolean).join(" — ").slice(0, 3000);
          const link = String(it?.link || "");
          const source = hostFromUrl(link) || "Naver Blog";
          return { text, url: link, source };
        })
      );
    }, undefined as any);
  }

  // --- (4) 버킷별 상한 (요약 속도 보장)
  out.aboutPages = out.aboutPages.slice(0, 3);
  out.careerPages = out.careerPages.slice(0, 3);
  out.jobPosts   = out.jobPosts.slice(0, 3);
  out.reports    = out.reports.slice(0, 5);

  return out;
}


/* ============================================================
   요약기(OpenAI)
============================================================ */
function flattenTexts(list: Array<{ text: string }>) {
  return list.map((x) => x.text).filter(Boolean).join("\n\n");
}

async function summarizeWithModel(instruction: string, corpus: string, opts: { strict: boolean }): Promise<string[]> {
  if (!corpus.trim()) return [];
  if (!oai) {
    // 키가 없는 개발환경에서도 최소 동작
    return [instruction ? instruction.slice(0, 40) + "…" : corpus.slice(0, 80) + "…"];
  }
  const sys = [
    "You are an extraction engine. Use ONLY facts explicitly present in the provided text.",
    "Return a JSON array of strings. If a requested point is not present, return an empty array.",
    opts.strict ? "STRICT MODE: Do not infer/guess; only verbatim-supported facts." : "LOOSE MODE: Paraphrase allowed but grounded.",
  ].join("\n");

  const user = [
    `# Instruction\n${instruction}`,
    `# Text\n${corpus.slice(0, 16000)}`,
  ].join("\n\n");

  const res = await oai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  try {
    const content = res.choices?.[0]?.message?.content || "[]";
    const json = JSON.parse(content);
    const arr = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
    return (arr as string[]).map(String).filter(Boolean);
  } catch {
    const txt = res.choices?.[0]?.message?.content || "";
    return txt
      .split(/\n+/)
      .map((s) => s.replace(/^[-•]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 10);
  }
}

/* ---------------- 섹션별 ---------------- */

async function summarizeBasic(company: string, role: string | null | undefined, ev: Evidence, { strict }: { strict: boolean }) {
  const newsHeads = (ev.news || []).map((n) => n.title).join("\n");
  const corpus = [flattenTexts(ev.aboutPages), flattenTexts(ev.reports), newsHeads].join("\n\n");
  const bullets = await summarizeWithModel("회사 핵심 요약을 최대 5개 불릿으로 작성", corpus, { strict });
  const blurbArr = await summarizeWithModel("두 문장으로 한 문단 요약", corpus, { strict });
  const blurb = blurbArr[0] ?? "";
  const sourceNotes = gatherSources([ev.aboutPages, ev.reports, ev.news as any]);
  return { blurb, bullets, sourceNotes };
}

async function summarizeValuesCultureTalent(
  company: string,
  role: string | null | undefined,
  ev: Evidence,
  { strict }: { strict: boolean }
) {
  const newsHeads = (ev.news || []).map((n) => n.title).join("\n");
  const corpus = [flattenTexts(ev.aboutPages), flattenTexts(ev.careerPages), flattenTexts(ev.reports), newsHeads].join("\n\n");
  const values = await summarizeWithModel("‘핵심 가치’ 목록만 추출", corpus, { strict });
  const culture = await summarizeWithModel("‘조직문화’ 항목만 추출", corpus, { strict });
  const talentTraits = await summarizeWithModel("‘인재상’ 항목만 추출", corpus, { strict });
  const sourceNotes = gatherSources([ev.aboutPages, ev.careerPages, ev.reports, ev.news as any]);
  return { values, culture, talentTraits, sourceNotes };
}

async function summarizeHiringPoints(company: string, role: string | null | undefined, ev: Evidence, { strict }: { strict: boolean }) {
  const newsHeads = (ev.news || []).map((n) => n.title).join("\n");
  const corpus = [flattenTexts(ev.jobPosts), flattenTexts(ev.careerPages), flattenTexts(ev.reports), newsHeads].join("\n\n");
  const hiringFocus = await summarizeWithModel("채용에서 중요하게 보는 포인트만 추출", corpus, { strict });
  const sourceNotes = gatherSources([ev.jobPosts, ev.careerPages, ev.reports, ev.news as any]);
  return { hiringFocus, sourceNotes };
}

async function summarizeTips(company: string, role: string | null | undefined, ev: Evidence, { strict }: { strict: boolean }) {
  const newsHeads = (ev.news || []).map((n) => n.title).join("\n");
  const corpus = [flattenTexts(ev.jobPosts), flattenTexts(ev.careerPages), flattenTexts(ev.reports), newsHeads].join("\n\n");
  const resumeTips = await summarizeWithModel("서류 팁을 ‘- ’ 불릿으로", corpus, { strict });
  const interviewTips = await summarizeWithModel("면접 팁을 ‘- ’ 불릿으로", corpus, { strict });
  const sourceNotes = gatherSources([ev.jobPosts, ev.careerPages, ev.reports, ev.news as any]);
  return { resumeTips, interviewTips, sourceNotes };
}

async function summarizeNews(company: string, ev: Evidence, { strict }: { strict: boolean }) {
  const items = (ev.news || []).filter((n) => n.title && (n.url || n.source));
  return strict ? items.filter((n) => n.url || n.source) : items;
}

/* ============================================================
   후처리/유틸
============================================================ */
function gatherSources(groups: Array<Array<{ url?: string; source?: string }>>): string[] {
  const bag = new Set<string>();
  for (const g of groups) for (const x of g || []) {
    const s = x.source || x.url;
    if (s) bag.add(s);
  }
  return Array.from(bag);
}

function sanitizeBriefInPlace(brief: CompanyBrief, { strict }: { strict: boolean }) {
  const hasAnySource = (brief.sourceNotes && brief.sourceNotes.length > 0) || (brief.recent && brief.recent.length > 0);
  const clean = (arr?: string[]) => (arr || []).map((s) => s.trim()).filter(Boolean);

  brief.bullets = clean(brief.bullets);
  brief.values = clean(brief.values);
  brief.culture = clean(brief.culture);
  brief.talentTraits = clean(brief.talentTraits);
  brief.hiringFocus = clean(brief.hiringFocus);
  brief.resumeTips = clean(brief.resumeTips);
  brief.interviewTips = clean(brief.interviewTips);

  if (strict && !hasAnySource) {
    brief.blurb = "";
    brief.bullets = [];
    brief.values = [];
    brief.culture = [];
    brief.talentTraits = [];
    brief.hiringFocus = [];
    brief.resumeTips = [];
    brief.interviewTips = [];
  }
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}
function mergeUnique(a: string[] | undefined, b: string[] | undefined) {
  const s = new Set<string>([...(a || []), ...(b || [])].map((x) => (x || "").trim()).filter(Boolean));
  return Array.from(s);
}
