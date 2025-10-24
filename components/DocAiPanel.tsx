"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiMode } from "@/app/actions/aiActions";
import { runAi } from "@/app/actions/aiActions";
import {
  fetchCompanyBrief,
  listRecentCompanyBriefs,
  refreshCompanyBrief,
  type CompanyBrief,
} from "@/app/actions/companyBrief";

/**
 * DocAiPanel — sticky 레이아웃(겹침/클리핑 방지)
 * - 좌측 경계선: (이중선 제거) 패널 자체의 라인을 그리지 않음
 * - 세로 높이: min/max-h = viewport(헤더 보정) → 하단 끊김/늘어짐 방지
 * - 우측 잘림: scrollbar-gutter 예약 + 우측 내부 여백 강화
 */
export default function DocAiPanel({
  company,
  role,
  getSelectionHtml,
  replaceSelection,
}: {
  company?: string;
  role?: string;
  getSelectionHtml: () => string;
  replaceSelection: (text: string) => void;
}) {
  /* ===== states ===== */
  const [mode, setMode] = useState<AiMode>("proofread");
  const [tone, setTone] = useState("차분하고 전문적");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [useContext, setUseContext] = useState(true);

  const [brief, setBrief] = useState<CompanyBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefErr, setBriefErr] = useState("");

  type SectionKey = "basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news";
  const SECTION_LABEL: Record<SectionKey, string> = {
    basic: "기본 회사 브리프",
    valuesCultureTalent: "핵심가치 · 조직문화 · 인재상",
    hiringPoints: "채용 포인트",
    tips: "서류 · 면접 팁",
    news: "최근 뉴스",
  };

  const [open, setOpen] = useState<Partial<Record<SectionKey, boolean>>>({});
  const [secLoading, setSecLoading] = useState<Partial<Record<SectionKey, boolean>>>({});
  const [secError, setSecError] = useState<Partial<Record<SectionKey, string | null>>>({});
  const [newsPage, setNewsPage] = useState(1);
  const NEWS_PAGE_SIZE = 5;

  const [recent, setRecent] = useState<CompanyBrief[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  /* ===== data fetch ===== */
  useEffect(() => {
    const c = (company ?? "").trim();
    if (!c) {
      setBrief(null);
      setBriefErr("");
      return;
    }
    let alive = true;
    (async () => {
      try {
        setBriefLoading(true);
        setBriefErr("");
        const data = await fetchCompanyBrief(c, role);
        if (!alive) return;
        setBrief(data);
        setOpen({});
        setSecLoading({});
        setSecError({});
        setNewsPage(1);
      } catch (e: any) {
        if (!alive) return;
        setBriefErr(e?.message || "회사 정보 불러오기 실패");
        setBrief(null);
      } finally {
        if (alive) setBriefLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [company, role]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setRecentLoading(true);
        const rows = await listRecentCompanyBriefs(8);
        if (!alive) return;
        setRecent(rows);
      } finally {
        if (alive) setRecentLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ===== sections ===== */
  const toggle = (key: SectionKey) => {
    setOpen((p) => ({ ...p, [key]: !p[key] }));
    if (!open[key]) void ensureSectionLoaded(key);
  };

  const ensureSectionLoaded = async (key: SectionKey) => {
    if (!company || !brief) return;
    if (key === "basic") {
      const has = (brief.blurb && brief.blurb.trim()) || (brief.bullets && brief.bullets.length);
      if (has) return;
    }
    if (key === "valuesCultureTalent") {
      const has =
        (brief.values && brief.values.length) ||
        (brief.culture && brief.culture.length) ||
        (brief.talentTraits && brief.talentTraits.length);
      if (has) return;
    }
    if (key === "hiringPoints" && brief.hiringFocus?.length) return;
    if (key === "tips" && ((brief.resumeTips && brief.resumeTips.length) || (brief.interviewTips && brief.interviewTips.length))) return;
    if (key === "news" && brief.recent?.length) return;
    await refreshSection(key);
  };

  const refreshSection = async (key: SectionKey) => {
    if (!company) return;
    setSecLoading((p) => ({ ...p, [key]: true }));
    setSecError((p) => ({ ...p, [key]: null }));
    try {
      let data: CompanyBrief | null = null;
      try {
        const refreshed = await (refreshCompanyBrief as any)(company, { role, section: key });
        data = refreshed ?? null;
      } catch {
        data = null;
      }
      if (!data) data = await fetchCompanyBrief(company, role);

      setBrief((prev) => {
        const base = prev ?? ({} as CompanyBrief);
        const merged: CompanyBrief = {
          ...base,
          ...data!,
          ...(key === "basic" ? { blurb: data!.blurb, bullets: data!.bullets } : {}),
          ...(key === "valuesCultureTalent"
            ? { values: data!.values, culture: data!.culture, talentTraits: data!.talentTraits }
            : {}),
          ...(key === "hiringPoints" ? { hiringFocus: data!.hiringFocus } : {}),
          ...(key === "tips" ? { resumeTips: data!.resumeTips, interviewTips: data!.interviewTips } : {}),
          ...(key === "news" ? { recent: data!.recent } : {}),
        };
        return merged;
      });
      if (!open[key]) setOpen((p) => ({ ...p, [key]: true }));
    } catch (e: any) {
      setSecError((p) => ({ ...p, [key]: e?.message || "섹션 로딩 실패" }));
    } finally {
      setSecLoading((p) => ({ ...p, [key]: false }));
    }
  };

  /* ===== prompt context ===== */
  const briefText = useMemo(() => {
    if (!brief) return "";
    const lines: string[] = [];
    if (brief.blurb?.trim()) lines.push(brief.blurb.trim());
    if (brief.bullets?.length) lines.push(brief.bullets.map((b) => (b.startsWith("•") ? b : `• ${b}`)).join("\n"));
    if (brief.values?.length) lines.push(`\n[핵심 가치]\n${brief.values.map(prefixDot).join("\n")}`);
    if (brief.culture?.length) lines.push(`\n[조직문화]\n${brief.culture.map(prefixDot).join("\n")}`);
    if (brief.talentTraits?.length) lines.push(`\n[인재상]\n${brief.talentTraits.map(prefixDot).join("\n")}`);
    if (brief.hiringFocus?.length) lines.push(`\n[채용 포인트]\n${brief.hiringFocus.map(prefixDot).join("\n")}`);
    if (brief.resumeTips?.length) lines.push(`\n[서류 팁]\n${brief.resumeTips.map(prefixDash).join("\n")}`);
    if (brief.interviewTips?.length) lines.push(`\n[면접 팁]\n${brief.interviewTips.map(prefixDash).join("\n")}`);
    if (brief.recent?.length) {
      const newsHeads = brief.recent
        .slice(0, 5)
        .map((n) => `• ${n.title}${n.source ? ` (${n.source})` : ""}${n.date ? ` - ${formatDate(n.date)}` : ""}`);
      if (newsHeads.length) lines.push(`\n[최근 뉴스]\n${newsHeads.join("\n")}`);
    }
    if (brief.sourceNotes?.length) lines.push(`\n[출처]\n- ${brief.sourceNotes.join("\n- ")}`);
    return lines.join("\n").trim();
  }, [brief]);

  /* ===== AI run ===== */
  const onRun = async () => {
    const selected = getSelectionHtml()?.trim();
    if (!selected) {
      setError("먼저 문서를 선택해주세요.");
      setTimeout(() => setError(""), 1800);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const payload =
        useContext && briefText
          ? `${selected}\n\n[회사 컨텍스트]\n회사: ${company ?? "-"} / 포지션: ${role ?? "-"}\n${briefText}`
          : selected;
      const result = await runAi(mode, payload, { tone });
      setPreview(result);
    } catch {
      setError("AI 요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onApply = () => {
    if (!preview.trim()) return;
    replaceSelection(preview);
    setPreview("");
  };

  /* ===== render ===== */
  const HEADER_H = 65;

  return (
    <>
      {/* sticky panel (좌측 라인 없음 / 우측 여백 강화) */}
      <aside
        className="
          w-[340px] lg:w-[360px] flex-none
          lg:sticky lg:top-[65px]
          bg-white shadow-sm
          p-4 pr-6
          overflow-y-auto overflow-x-hidden
          box-border break-words
        "
        style={{
          minHeight: `calc(100vh - ${HEADER_H}px)`,
          maxHeight: `calc(100vh - ${HEADER_H}px)`,
          // 우측 잘림 방지: 스크롤바 공간 확보
          scrollbarGutter: "stable both-edges" as any,
          // 스크롤 버블링 최소화
          overscrollBehavior: "contain",
          // 노치/세이프에어리어 환경 보정
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        {/* --- 상단: 회사 선택 요약 --- */}
        <div className="rounded-xl border p-3">
          <div className="text-xs text-gray-500">선택한 회사</div>
          <div className="font-semibold text-lg leading-tight">{company || "—"}</div>
          {role && <div className="text-sm mt-0.5 text-gray-600">포지션: {role}</div>}
          {briefLoading ? (
            <div className="text-xs text-gray-500 mt-2">브리프 로딩 중…</div>
          ) : briefErr ? (
            <div className="text-xs text-rose-600 mt-2">{briefErr}</div>
          ) : (
            <div className="text-xs text-gray-500 mt-2">
              캐시 기준 요약을 불러왔습니다. 필요한 섹션만 펼치거나 ‘재생성’을 눌러 갱신하세요.
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            <label className="text-[11px] inline-flex items-center gap-1">
              <input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} />
              프롬프트에 포함
            </label>
            <button
              className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
              onClick={() => brief && replaceSelection(buildPlainBlock(brief))}
            >
              문서에 삽입(텍스트)
            </button>
            <button
              className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
              onClick={() => {
                if (!brief) return;
                const html = buildRichHtml(brief);
                document.execCommand("insertHTML", false, html);
              }}
            >
              문서에 삽입(리치)
            </button>
            <button
              className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
              onClick={async () => {
                if (!company) return;
                setBriefLoading(true);
                try {
                  const data = await fetchCompanyBrief(company, role);
                  setBrief(data);
                } finally {
                  setBriefLoading(false);
                }
              }}
            >
              새로고침
            </button>
            <button
              className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
              onClick={async () => {
                if (!company) return;
                setBriefLoading(true);
                try {
                  const data = await refreshCompanyBrief(company, role as any);
                  setBrief(data);
                } finally {
                  setBriefLoading(false);
                }
              }}
            >
              강제 재생성
            </button>
            {brief && (
              <span className="text-[10px] text-gray-400 self-center">
                {new Date(brief.updatedAt).toLocaleDateString()} 기준
              </span>
            )}
          </div>
        </div>

        {/* --- 섹션 아코디언 --- */}
        <Sections
          brief={brief}
          open={open}
          secLoading={secLoading}
          secError={secError}
          toggle={toggle}
          refreshSection={refreshSection}
          newsPage={newsPage}
          setNewsPage={setNewsPage}
          NEWS_PAGE_SIZE={NEWS_PAGE_SIZE}
        />

        {/* --- 하단: 선택영역 AI 첨삭 --- */}
        <div className="rounded-xl border p-3 mt-4">
          <div className="font-semibold mb-2">✨ 선택영역 AI 도우미</div>
          <div className="flex flex-col gap-2">
            <select className="border rounded p-2" value={mode} onChange={(e) => setMode(e.target.value as AiMode)}>
              <option value="proofread">맞춤법/가독성 첨삭</option>
              <option value="rewrite_tone">톤 변경</option>
              <option value="summarize">요약</option>
              <option value="keywords">키워드 추출</option>
              <option value="translate_en">영문 번역</option>
              <option value="translate_ko">국문 번역</option>
              <option value="expand">🧩 내용 보충(확장)</option>
            </select>

            {(mode === "rewrite_tone" || mode === "expand") && (
              <input
                className="border rounded p-2"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="예) 자신감 있고 간결"
              />
            )}

            <button onClick={onRun} className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={loading}>
              {loading ? "생성 중..." : mode === "expand" ? "선택 내용 보충" : "선택영역 첨삭"}
            </button>

            {error && <div className="text-xs text-rose-600">{error}</div>}

            <div className="border rounded p-2 h-40 overflow-auto whitespace-pre-wrap text-sm break-words">
              {preview || <span className="text-gray-400">미리보기</span>}
            </div>

            <button
              onClick={onApply}
              className="rounded-lg bg-black text-white px-3 py-2 disabled:opacity-50"
              disabled={!preview.trim()}
            >
              이 내용으로 대체
            </button>
          </div>
        </div>

        {/* --- 최근 회사 요약 --- */}
        <div className="rounded-xl border p-3 mt-4">
          <div className="text-xs font-semibold text-gray-700 mb-2">🕘 최근 회사 요약</div>
          {recentLoading ? (
            <div className="text-xs text-gray-500">불러오는 중…</div>
          ) : recent.length === 0 ? (
            <div className="text-[11px] text-gray-400">최근 기록이 없습니다.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r, idx) => (
                <button
                  key={idx}
                  className="text-[11px] px-2 py-1 rounded-full border bg-white hover:bg-gray-50"
                  title={r.blurb}
                  onClick={() => replaceSelection(buildPlainBlock(r))}
                >
                  {r.company}
                  {r.role ? `·${r.role}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ========== sub components / utils ========== */

function Sections(props: {
  brief: CompanyBrief | null;
  open: Partial<Record<"basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news", boolean>>;
  secLoading: Partial<Record<any, boolean>>;
  secError: Partial<Record<any, string | null>>;
  toggle: (k: any) => void;
  refreshSection: (k: any) => void;
  newsPage: number;
  setNewsPage: (fn: (p: number) => number) => void;
  NEWS_PAGE_SIZE: number;
}) {
  const {
    brief,
    open,
    secLoading,
    secError,
    toggle,
    refreshSection,
    newsPage,
    setNewsPage,
    NEWS_PAGE_SIZE,
  } = props;

  const keys: ("basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news")[] = [
    "basic",
    "valuesCultureTalent",
    "hiringPoints",
    "tips",
    "news",
  ];
  const LABEL: any = {
    basic: "기본 회사 브리프",
    valuesCultureTalent: "핵심가치 · 조직문화 · 인재상",
    hiringPoints: "채용 포인트",
    tips: "서류 · 면접 팁",
    news: "최근 뉴스",
  };

  return (
    <div className="flex flex-col gap-2 mt-4">
      {keys.map((key) => (
        <div key={key} className="rounded-xl border">
          <button onClick={() => toggle(key)} className="w-full text-left p-3 hover:bg-gray-50 rounded-t-xl">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className={`inline-block transition-transform ${open[key] ? "rotate-90" : ""}`}>▸</span>
                <span className="font-medium">{LABEL[key]}</span>
              </div>
              <div className="flex items-center gap-2">
                {secLoading[key] && <span className="text-xs text-gray-500">갱신 중…</span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void refreshSection(key);
                  }}
                  className="text-xs rounded-md border px-2 py-1 hover:bg-gray-50"
                >
                  재생성
                </button>
              </div>
            </div>
          </button>
          {open[key] && (
            <div className="px-3 pb-3">
              {renderSectionBody(
                key,
                brief,
                secLoading[key],
                secError[key],
                newsPage,
                NEWS_PAGE_SIZE,
                setNewsPage
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function renderSectionBody(
  key: "basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news",
  brief: CompanyBrief | null,
  busy?: boolean,
  err?: string | null,
  newsPage?: number,
  NEWS_PAGE_SIZE?: number,
  setNewsPage?: (fn: (p: number) => number) => void
) {
  if (busy) return <div className="text-sm text-gray-500 animate-pulse">불러오는 중…</div>;
  if (err) return <div className="text-sm text-rose-600">오류: {err}</div>;
  if (!brief) return <div className="text-sm text-gray-500">데이터가 없습니다.</div>;

  if (key === "news") {
    const list = brief.recent ?? [];
    if (!list.length) return <div className="text-sm text-gray-500">표시할 뉴스가 없습니다.</div>;
    const end = Math.min(list.length, (newsPage ?? 1) * (NEWS_PAGE_SIZE ?? 5));
    const pageItems = list.slice(0, end);

    return (
      <div className="space-y-3">
        {pageItems.map((n, i) => (
          <div key={`${n.url ?? n.title}-${i}`} className="rounded-lg border p-3 hover:bg-gray-50 transition">
            <div className="font-medium text-sm break-words">
              {n.url ? (
                <a href={n.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
                  {n.title}
                </a>
              ) : (
                n.title
              )}
            </div>
            {(n.source || n.date) && (
              <div className="text-xs text-gray-500 mt-0.5">
                {[n.source, formatDate(n.date)].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        ))}
        {end < list.length && setNewsPage && (
          <button onClick={() => setNewsPage((p) => p + 1)} className="text-sm rounded-md border px-3 py-1.5">
            더 보기 ({list.length - end}개 남음)
          </button>
        )}
      </div>
    );
  }

  if (key === "basic") {
    const has = (brief.blurb && brief.blurb.trim()) || (brief.bullets && brief.bullets.length);
    if (!has) return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘재생성’을 눌러 갱신해 보세요.</div>;
    return (
      <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words">
        {brief.blurb && <p>{brief.blurb}</p>}
        {brief.bullets?.length ? (
          <ul className="list-disc pl-5 break-words">
            {brief.bullets.map((b, i) => (
              <li key={i}>{b.replace(/^•\s?/, "")}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (key === "valuesCultureTalent") {
    const blocks: JSX.Element[] = [];
    if (brief.values?.length) blocks.push(<ListBlock key="v" title="핵심 가치" items={brief.values} />);
    if (brief.culture?.length) blocks.push(<ListBlock key="c" title="조직문화" items={brief.culture} />);
    if (brief.talentTraits?.length) blocks.push(<ListBlock key="t" title="인재상" items={brief.talentTraits} />);
    if (!blocks.length) return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘재생성’을 눌러 갱신해 보세요.</div>;
    return <div className="space-y-3">{blocks}</div>;
  }

  if (key === "hiringPoints") {
    if (!brief.hiringFocus?.length) return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘재생성’을 눌러 갱신해 보세요.</div>;
    return <ListBlock title="채용 포인트" items={brief.hiringFocus} />;
  }

  if (key === "tips") {
    const blocks: JSX.Element[] = [];
    if (brief.resumeTips?.length) blocks.push(<ListBlock key="r" title="서류 팁" items={brief.resumeTips} marker="-" />);
    if (brief.interviewTips?.length) blocks.push(<ListBlock key="i" title="면접 팁" items={brief.interviewTips} marker="-" />);
    if (!blocks.length) return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘재생성’을 눌러 갱신해 보세요.</div>;
    return <div className="space-y-3">{blocks}</div>;
  }

  return null;
}

function ListBlock({ title, items, marker = "•" }: { title: string; items: string[]; marker?: "•" | "-" }) {
  return (
    <div>
      <div className="font-semibold break-words">{title}</div>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((t, i) => (
          <li key={i} className="break-words">
            {marker === "•" ? t.replace(/^•\s?/, "• ") : t.replace(/^-?\s?/, "- ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ===== html builders ===== */

function buildRichHtml(brief: CompanyBrief) {
  const vals = renderList("핵심 가치", brief.values);
  const cult = renderList("조직문화", brief.culture);
  const talent = renderList("인재상", brief.talentTraits);
  const hire = renderList("채용에서 중요하게 보는 포인트", brief.hiringFocus);
  const resume = renderList("서류 합격 Tip", brief.resumeTips);
  const inter = renderList("면접 Tip", brief.interviewTips);
  const news = renderNews("최근 이슈 / 뉴스", brief.recent);
  const sources =
    brief.sourceNotes?.length
      ? `<div class="mt-2 text-[11px] text-gray-500">출처: ${escapeHtml(brief.sourceNotes.join(", "))}</div>`
      : "";
  return `
<section class="rounded-xl border bg-white p-4 my-4">
  <h3 class="font-bold text-[15px] mb-2">🏢 회사 브리프 — ${escapeHtml(brief.company)}${
    brief.role ? ` / ${escapeHtml(brief.role)}` : ""
  }</h3>
  <p class="text-[13px] text-gray-700 mb-2">${escapeHtml(brief.blurb ?? "")}</p>
  ${vals}${cult}${talent}${hire}${resume}${inter}${news}
  ${sources}
  <div class="mt-2 text-[11px] text-gray-400">업데이트: ${escapeHtml(
    new Date(brief.updatedAt).toLocaleDateString()
  )}</div>
</section>`.trim();
}

/* ===== small utils ===== */

function buildPlainBlock(b: CompanyBrief): string {
  const lines: string[] = [];
  lines.push(`🏢 회사 브리프 — ${b.company}${b.role ? ` / ${b.role}` : ""}`);
  if (b.blurb) lines.push(b.blurb);

  const pushList = (label: string, arr?: string[]) => {
    if (!arr || arr.length === 0) return;
    lines.push(`\n${label}`);
    arr.forEach((x) => lines.push(prefixDot(x)));
  };

  if (b.bullets?.length) {
    lines.push("\n핵심 요약");
    b.bullets.forEach((x) => lines.push(x.startsWith("•") ? x : `• ${x}`));
  }

  pushList("핵심 가치", b.values);
  pushList("조직문화", b.culture);
  pushList("인재상", b.talentTraits);
  pushList("채용 포인트", b.hiringFocus);
  pushList("서류 팁", b.resumeTips);
  pushList("면접 팁", b.interviewTips);

  if (b.recent?.length) {
    lines.push("\n최근 뉴스");
    b.recent.slice(0, 5).forEach((n) => {
      const meta = [n.source, formatDate(n.date)].filter(Boolean).join(" · ");
      lines.push(`• ${n.title}${meta ? ` (${meta})` : ""}${n.url ? ` <${n.url}>` : ""}`);
    });
  }

  if (b.sourceNotes?.length) lines.push(`\n출처: ${b.sourceNotes.join(", ")}`);
  lines.push(`\n업데이트: ${new Date(b.updatedAt).toLocaleDateString()}`);

  return lines.join("\n").trim();
}
function renderList(title: string, arr?: string[]) {
  if (!arr || arr.length === 0) return "";
  const lis = arr.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  return `
  <div class="mt-2">
    <div class="font-semibold mb-1">${escapeHtml(title)}</div>
    <ul class="list-disc pl-5 space-y-1">${lis}</ul>
  </div>`.trim();
}
function renderNews(
  title: string,
  arr?: { title: string; url?: string; source?: string; date?: string }[]
) {
  if (!arr || arr.length === 0) return "";
  const lis = arr
    .slice(0, 6)
    .map((n) => {
      const main = n.url
        ? `<a href="${escapeAttr(n.url)}" target="_blank" class="underline break-all">${escapeHtml(n.title)}</a>`
        : escapeHtml(n.title);
      const meta = [n.source, formatDate(n.date)].filter(Boolean).map(escapeHtml).join(" · ");
      return `<li>${main}${meta ? ` <span class="text-[11px] text-gray-500">· ${meta}</span>` : ""}</li>`;
    })
    .join("");
  return `
  <div class="mt-2">
    <div class="font-semibold mb-1">${escapeHtml(title)}</div>
    <ul class="list-disc pl-5 space-y-1">${lis}</ul>
  </div>`.trim();
}
function prefixDot(s: string) {
  return s.startsWith("•") ? s : `• ${s}`;
}
function prefixDash(s: string) {
  return s.startsWith("-") ? s : `- ${s}`;
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
function escapeAttr(s: string) {
  return s.replace(/"/g, "&quot;");
}
function formatDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toISOString().slice(0, 10);
}
