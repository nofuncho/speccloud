"use server";

/**
 * companyBrief.ts — Evidence 기반 요약(빠른 모드 기본) + OpenAI/Naver 수집
 * - 속도 강화: 타임박스, 병렬 풀, TTL 캐시, 입력 길이 제한, 폴백 요약
 * - 모드: FAST(초기/자동) vs FULL(수동 재생성)
 * - 기본 회사정보(설립/본사/직원수/매출/사업분야) 우선 추출 → 요약 보조
 */

import OpenAI from "openai";
import { once } from "@/app/lib/fetchGuard";
import {
  hasNaver,
  naverJson,
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

type SpeedMode = "fast" | "full";
type RefreshOpts =
  | {
      role?: string | null;
      section?: "basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news";
      strict?: boolean;
      includeCommunity?: boolean;
      manualUrls?: string[];
      speed?: SpeedMode;
    }
  | undefined;

/* ============================================================
   캐시 (데모용 메모리)
============================================================ */
const briefMem = new Map<string, CompanyBrief>();
const keyOf = (c: string, r?: string | null) => `${c.toLowerCase()}::${(r ?? "").toLowerCase()}`;

// Evidence 캐시(회사+모드+includeCommunity 별)
type Evidence = {
  aboutPages: Array<{ text: string; url: string; source: string }>;
  careerPages: Array<{ text: string; url: string; source: string }>;
  jobPosts: Array<{ text: string; url: string; source: string; date?: string }>;
  reports: Array<{ text: string; url: string; source: string; date?: string }>;
  news: Array<{ title: string; url: string; source: string; date?: string }>;
};
const evidenceMem = new Map<string, { data: Evidence; at: number; ttl: number }>();
const ttlPagesMs = 30 * 60 * 1000; // 30분
const ttlNewsMs = 10 * 60 * 1000;  // 10분

/* ============================================================
   퍼블릭 API
============================================================ */
export async function listRecentCompanyBriefs(n = 8): Promise<CompanyBrief[]> {
  const all = Array.from(briefMem.values()).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  return all.slice(0, n);
}

export async function fetchCompanyBrief(company: string, role?: string | null): Promise<CompanyBrief> {
  const k = keyOf(company, role);
  const cached = briefMem.get(k);
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
  briefMem.set(k, empty);
  return clone(empty);
}

export async function refreshCompanyBrief(company: string, opts?: RefreshOpts): Promise<CompanyBrief> {
  const role = opts?.role ?? null;
  const strict = opts?.strict ?? true;
  const section = opts?.section;
  const speed: SpeedMode = opts?.speed || "fast";
  const includeCommunity = !!opts?.includeCommunity;

  const current = await fetchCompanyBrief(company, role);

  const cacheKey = `brief:${company.toLowerCase()}::${section || "all"}::${role || ""}::${strict ? "O" : "M"}::${speed}::${includeCommunity?"C":"N"}`;
  const next = await once(cacheKey, async () => {
    const evidence = await collectEvidence(company, role, { includeCommunity, manualUrls: opts?.manualUrls, speed });

    const draft = clone(current);

    if (!section || section === "basic") {
      const { blurb, bullets, sourceNotes } = await summarizeBasic(company, role, evidence, { strict, speed });
      draft.blurb = blurb;
      draft.bullets = bullets;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "valuesCultureTalent") {
      const { values, culture, talentTraits, sourceNotes } = await summarizeValuesCultureTalent(company, role, evidence, {
        strict, speed,
      });
      draft.values = values;
      draft.culture = culture;
      draft.talentTraits = talentTraits;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "hiringPoints") {
      const { hiringFocus, sourceNotes } = await summarizeHiringPoints(company, role, evidence, { strict, speed });
      draft.hiringFocus = hiringFocus;
      draft.sourceNotes = mergeUnique(draft.sourceNotes, sourceNotes);
    }
    if (!section || section === "tips") {
      const { resumeTips, interviewTips, sourceNotes } = await summarizeTips(company, role, evidence, { strict, speed });
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
    briefMem.set(k, draft);
    return draft;
  });

  return clone(next);
}

/* ============================================================
   수집 레이어 (속도모드 + TTL 캐시)
============================================================ */
function evKey(company: string, role: string|null|undefined, speed: SpeedMode, includeCommunity: boolean) {
  return `${company.toLowerCase()}::${(role||"").toLowerCase()}::${speed}::${includeCommunity?"C":"N"}`;
}
function fromCache(company: string, role: string|null|undefined, speed: SpeedMode, includeCommunity: boolean): Evidence|undefined {
  const k = evKey(company, role, speed, includeCommunity);
  const hit = evidenceMem.get(k);
  if (hit && Date.now() - hit.at < hit.ttl) return clone(hit.data);
  return undefined;
}
function saveCache(company: string, role: string|null|undefined, speed: SpeedMode, includeCommunity: boolean, data: Evidence) {
  const k = evKey(company, role, speed, includeCommunity);
  const ttl = ttlPagesMs;
  evidenceMem.set(k, { data: clone(data), at: Date.now(), ttl });
}

async function collectEvidence(
  company: string,
  role?: string | null,
  opts?: { includeCommunity?: boolean; manualUrls?: string[]; speed?: SpeedMode }
): Promise<Evidence> {
  const speed: SpeedMode = opts?.speed || "fast";
  const includeCommunity = !!opts?.includeCommunity;

  const cached = fromCache(company, role ?? null, speed, includeCommunity);
  if (cached) return cached;

  const out: Evidence = { aboutPages: [], careerPages: [], jobPosts: [], reports: [], news: [] };

  // 모드별 파라미터
  const P = speed === "fast"
    ? { deadlineMs: 3500, pool: 5, webDisplay: 6, fetchMs: 1600, blogDisplay: 6 }
    : { deadlineMs: 8000, pool: 8, webDisplay: 12, fetchMs: 3000, blogDisplay: 10 };

  const deadline = Date.now() + P.deadlineMs;
  const timeLeft = () => Math.max(0, deadline - Date.now());
  const withBudget = async <T>(fn: () => Promise<T>, fallback: T) => {
    if (timeLeft() <= 0) return fallback;
    try { return await fn(); } catch { return fallback; }
  };
  const runPool = async <T>(jobs: Array<() => Promise<T>>, limit = P.pool): Promise<T[]> => {
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
    if (!text || text.length < 400) return;
    const source = hostFromUrl(url) || "web";
    if (/\/(shop|store|coupon|event)\//i.test(url)) return;
    (out[bucket] as any).push({ text, url, source });
  };

  // (0) 뉴스 — 가벼움
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

  // (1) 후보 URL
  const guessDomains = (name: string): string[] => {
    const n = name.replace(/[^a-zA-Z0-9가-힣.\s-]/g, " ").replace(/\s+/g, " ").trim();
    const stems = [n, n.replace(/\s+/g, ""), n.replace(/\s+/g, "-"), n.replace(/\s+/g, "").toLowerCase()];
    const tlds = [".co.kr", ".com", ".kr"];
    const hosts = new Set<string>();
    stems.forEach((s) => tlds.forEach((t) => hosts.add(`https://${s}${t}`)));
    return Array.from(hosts);
  };
  const candidateRoots = guessDomains(company);
  const tryPaths = ["/about", "/company", "/culture", "/values", "/mission", "/vision", "/careers", "/jobs", "/recruit"];
  const rootUrls: string[] = [];
  candidateRoots.forEach((root) => tryPaths.forEach((p) => rootUrls.push(root + p)));

  let webUrls: string[] = [];
  if (hasNaver && timeLeft() > 0) {
    await withBudget(async () => {
      const webkr = new URL("https://openapi.naver.com/v1/search/webkr.json");
      webkr.searchParams.set("query", `${company} (회사 소개|핵심가치|조직문화|채용|careers|recruit)`);
      webkr.searchParams.set("display", String(P.webDisplay));
      webkr.searchParams.set("sort", "sim");
      const data = await naverJson(webkr.toString());
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      webUrls = items.map((it: any) => String(it?.link || it?.url || "")).filter(Boolean);
    }, undefined as any);
  }

  // ✅ 위키/IR/연차보고서도 직접 검색해 본문 확보(정확한 기본정보 소스)
  if (hasNaver && timeLeft() > 0) {
    await withBudget(async () => {
      const qList = [
        `${company} 위키백과`,
        `${company} 나무위키`,
        `${company} IR`,
        `${company} 연차보고서`,
        `${company} 기업보고서`,
      ];
      const seen = new Set<string>();
      for (const q of qList) {
        const u = new URL("https://openapi.naver.com/v1/search/webkr.json");
        u.searchParams.set("query", q);
        u.searchParams.set("display", "3");
        u.searchParams.set("sort", "sim");
        const data = await naverJson(u.toString());
        const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
        for (const it of items) {
          const url = String(it?.link || it?.url || "");
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const text = await fetchTextFromUrl(url, Math.min(P.fetchMs, timeLeft()));
          if (!text) continue;
          const host = hostFromUrl(url) || "web";
          if (/wikipedia\.org|namu\.wiki/i.test(host)) {
            out.aboutPages.push({ text, url, source: host });
          } else if (/dart\.fss\.or\.kr|\/ir\.|\/invest(or|or-relations)/i.test(url)) {
            out.reports.push({ text, url, source: host });
          } else {
            out.aboutPages.push({ text, url, source: host });
          }
        }
      }
    }, undefined as any);
  }

  const manual = opts?.manualUrls || [];
  const allCandidates = Array.from(new Set<string>([...manual, ...rootUrls, ...webUrls])).slice(0, 24);

  // (2) 본문 수집
  const jobs = allCandidates.map((url) => async () => {
    if (timeLeft() <= 0) return;
    const text = await fetchTextFromUrl(url, Math.min(P.fetchMs, timeLeft()));
    if (!text) return;
    if (/jobs?|recruit|careers/i.test(url)) pushIfText("careerPages", text, url);
    else if (/culture|values|mission|vision/i.test(url)) pushIfText("aboutPages", text, url);
    else pushIfText("aboutPages", text, url);
  });
  await runPool(jobs, P.pool);

  // (3) 블로그(혼합)
  if (includeCommunity && hasNaver && timeLeft() > 0) {
    await withBudget(async () => {
      const u = new URL("https://openapi.naver.com/v1/search/blog.json");
      u.searchParams.set("query", company);
      u.searchParams.set("display", String(P.blogDisplay));
      u.searchParams.set("sort", "date");
      const data = await naverJson(u.toString());
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      out.reports.push(
        ...items.map((it: any) => {
          const title = stripTags(it?.title || "");
          const desc = stripTags(it?.description || "");
          const text = [title, desc].filter(Boolean).join(" — ").slice(0, 2400);
          const link = String(it?.link || "");
          const source = hostFromUrl(link) || "Naver Blog";
          return { text, url: link, source };
        })
      );
    }, undefined as any);
  }

  // (4) 상한
  out.aboutPages = out.aboutPages.slice(0, 3);
  out.careerPages = out.careerPages.slice(0, 3);
  out.jobPosts   = out.jobPosts.slice(0, 3);
  out.reports    = out.reports.slice(0, 5);

  saveCache(company, role ?? null, speed, includeCommunity, out);
  return out;
}

/* ============================================================
   요약기(OpenAI) — 폴백/정제
============================================================ */
const KW = {
  basic: /(회사\s*소개|기업\s*소개|비전|미션|연혁|사업|제품|조직|개요)/i,
  vct: /(핵심\s*가치|가치관|조직문화|문화|인재상|Values?|Culture|Mission|Vision)/i,
  hiring: /(채용|모집|지원자격|자격요건|우대사항|담당업무|역할|요건)/i,
  tips: /(자소서|서류|포트폴리오|면접|면접\s*팁|interview|resume|cv)/i,
};
const BLOCK = /(구독|렌탈|요금|상담|결합\s*할인|쇼핑|쿠폰|배송|TV|A\/S)/i;

function splitParagraphs(text: string): string[] {
  return (text || "")
    .replace(/\r/g, "")
    .split(/\n{2,}|(?<=\.)\s+(?=[가-힣A-Za-z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function pickRelevant(text: string, re: RegExp): string {
  return splitParagraphs(text).filter((p) => re.test(p) && !BLOCK.test(p)).slice(0, 12).join("\n");
}
function flattenTextsFiltered(list: Array<{ text: string }>, re: RegExp) {
  return (list || []).map((x) => pickRelevant(x.text, re)).filter(Boolean).join("\n\n");
}
function flattenTexts(list: Array<{ text: string }>) {
  return (list || []).map((x) => x.text).filter(Boolean).join("\n\n");
}
function postClean(list: string[]): string[] {
  const clean = (s: string) =>
    s.replace(/```json|```/gi, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const out = Array.from(
    new Set((list || []).map(clean).filter((s) => s && !BLOCK.test(s) && s.length >= 4 && s.length <= 180))
  );
  return out.slice(0, 12);
}
function fallbackArrayFromText(corpus: string, maxItems = 6): string[] {
  const text = (corpus || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const sents = text.split(/(?<=[.?!])\s+/).filter(Boolean).slice(0, maxItems);
  if (sents.length >= Math.min(3, maxItems)) return sents;
  const lines = (corpus || "").split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, maxItems);
  return lines.length ? lines : [text.slice(0, 220)];
}

async function summarizeWithModel(
  instruction: string,
  corpus: string,
  opts: { strict: boolean; speed: SpeedMode }
): Promise<string[]> {
  const trimmed = (corpus || "").trim();
  if (!trimmed) return [];
  const maxChars = opts.speed === "fast" ? 6000 : 14000;
  const input = trimmed.slice(0, maxChars);

  if (!oai) return postClean(fallbackArrayFromText(input, 6));

  const sys = [
    '한국어 정보 추출기. {"items":[string,...]} JSON만 반환.',
    opts.strict
      ? "STRICT: 제공 텍스트에 명시된 사실만. 없으면 빈 배열."
      : "LOOSE: 재서술 허용하되 텍스트 근거 범위 내.",
  ].join("\n");
  const user = `# Instruction\n${instruction}\n\n# Text\n${input}`;

  try {
    const res = await oai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    const content = res.choices?.[0]?.message?.content?.trim() || '{"items":[]}';
    let items: string[] = [];
    try {
      const j = JSON.parse(content);
      if (Array.isArray(j?.items)) items = j.items.map(String);
      else if (Array.isArray(j)) items = j.map(String);
    } catch {
      items = content.split(/\n+/).map((s) => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
    }
    return postClean(items);
  } catch {
    return postClean(fallbackArrayFromText(input, 6));
  }
}

/* ---------------- 기본정보 추출 유틸 (신규) ---------------- */
function extractCompanyFacts(text: string) {
  const t = (text || "").replace(/\s+/g, " ");
  const out: { founded?: string; hq?: string; employees?: string; revenue?: string; industry?: string } = {};

  const mYear = t.match(/(설립|창립)\s*[:：]?\s*(19|20)\d{2}\s*년/);
  if (mYear) out.founded = mYear[0].replace(/(설립|창립)\s*[:：]?\s*/,"").replace(/\s+/g,"").replace("년","년");

  const mHQ = t.match(/(본사|주소)\s*[:：]?\s*([가-힣A-Za-z0-9·\-\s,]{3,40})/);
  if (mHQ) out.hq = mHQ[2].trim();

  const mEmp = t.match(/(임직원|직원|사원)\s*[:：]?\s*([0-9][0-9,\.]{0,12})\s*명/);
  if (mEmp) out.employees = `${mEmp[2].replace(/[^\d]/g,"")}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "명";

  const mRev = t.match(/(매출|매출액)\s*[:：]?\s*([0-9][0-9,\.]{0,12})\s*(조원|억원|원|KRW|₩|\$|달러)/);
  if (mRev) out.revenue = `${mRev[2]} ${mRev[3]}`.replace(/\s+/g,"");

  const mInd = t.match(/(산업|업종|사업\s*분야)\s*[:：]?\s*([가-힣A-Za-z0-9·\-\s,\/]{3,50})/);
  if (mInd) out.industry = mInd[2].trim();

  return out;
}
function collectFactsFromBodies(bodies: string[]) {
  const agg = { founded: "", hq: "", employees: "", revenue: "", industry: "" };
  for (const body of bodies) {
    const f = extractCompanyFacts(body);
    agg.founded   ||= f.founded || "";
    agg.hq        ||= f.hq || "";
    agg.employees ||= f.employees || "";
    agg.revenue   ||= f.revenue || "";
    agg.industry  ||= f.industry || "";
  }
  return agg;
}

/* ---------------- 섹션별 ---------------- */
async function summarizeBasic(
  company: string,
  role: string | null | undefined,
  ev: Evidence,
  { strict, speed }: { strict: boolean; speed: SpeedMode }
) {
  // 1) 기본정보(위키/IR/소개문)에서 먼저 뽑기
  const bodies = [
    ...ev.aboutPages.map(x => x.text),
    ...ev.reports.map(x => x.text),
    ...ev.careerPages.map(x => x.text),
  ];
  const facts = collectFactsFromBodies(bodies);

  // 2) 요약은 소개/리포트 중심 + 뉴스 헤드 보조
  const newsHeads = (ev.news || []).slice(0, 4).map((n) => n.title).join("\n");
  const corpus = [
    flattenTextsFiltered(ev.aboutPages, KW.basic),
    flattenTexts(ev.reports),
    newsHeads,
  ].join("\n\n");

  const bulletsFromModel = await summarizeWithModel("회사 핵심 요약을 최대 5개 불릿으로 작성", corpus, { strict, speed });
  const blurbArr = await summarizeWithModel("두 문장으로 한 문단 요약", corpus, { strict, speed });
  const blurb = blurbArr[0] ?? "";

  // 3) 사실 불릿을 상단에 우선 배치
  const factBullets: string[] = [];
  if (facts.founded)   factBullets.push(`설립: ${facts.founded}`);
  if (facts.hq)        factBullets.push(`본사: ${facts.hq}`);
  if (facts.industry)  factBullets.push(`사업분야: ${facts.industry}`);
  if (facts.employees) factBullets.push(`직원수: ${facts.employees}`);
  if (facts.revenue)   factBullets.push(`매출: ${facts.revenue}`);

  const bullets = [...factBullets, ...bulletsFromModel].slice(0, 8);

  const sourceNotes = gatherSources([ev.aboutPages, ev.reports, ev.news as any]);
  return { blurb, bullets, sourceNotes };
}

async function summarizeValuesCultureTalent(
  company: string,
  role: string | null | undefined,
  ev: Evidence,
  { strict, speed }: { strict: boolean; speed: SpeedMode }
) {
  const corpus = [
    flattenTextsFiltered(ev.aboutPages, KW.vct),
    flattenTextsFiltered(ev.careerPages, KW.vct),
    flattenTexts(ev.reports),
  ].join("\n\n");
  const values = await summarizeWithModel("‘핵심 가치’ 목록만 추출", corpus, { strict, speed });
  const culture = await summarizeWithModel("‘조직문화’ 항목만 추출", corpus, { strict, speed });
  const talentTraits = await summarizeWithModel("‘인재상’ 항목만 추출", corpus, { strict, speed });
  const sourceNotes = gatherSources([ev.aboutPages, ev.careerPages, ev.reports]);
  return { values, culture, talentTraits, sourceNotes };
}
async function summarizeHiringPoints(
  company: string,
  role: string | null | undefined,
  ev: Evidence,
  { strict, speed }: { strict: boolean; speed: SpeedMode }
) {
  const corpus = [
    flattenTextsFiltered(ev.careerPages, KW.hiring),
    flattenTextsFiltered(ev.jobPosts, KW.hiring),
    flattenTexts(ev.reports),
  ].join("\n\n");
  const hiringFocus = await summarizeWithModel("채용에서 중요하게 보는 포인트만 추출", corpus, { strict, speed });
  const sourceNotes = gatherSources([ev.jobPosts, ev.careerPages, ev.reports]);
  return { hiringFocus, sourceNotes };
}
async function summarizeTips(
  company: string,
  role: string | null | undefined,
  ev: Evidence,
  { strict, speed }: { strict: boolean; speed: SpeedMode }
) {
  const corpus = [
    flattenTextsFiltered(ev.careerPages, KW.tips),
    flattenTextsFiltered(ev.jobPosts, KW.tips),
    flattenTexts(ev.reports),
  ].join("\n\n");
  const resumeTips = await summarizeWithModel("서류 팁을 ‘- ’ 불릿으로", corpus, { strict, speed });
  const interviewTips = await summarizeWithModel("면접 팁을 ‘- ’ 불릿으로", corpus, { strict, speed });
  const sourceNotes = gatherSources([ev.jobPosts, ev.careerPages, ev.reports]);
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
