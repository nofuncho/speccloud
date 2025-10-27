"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import type { AiMode } from "@/app/actions/aiActions";
import { runAi } from "@/app/actions/aiActions";
import {
  fetchCompanyBrief,
  listRecentCompanyBriefs,
  refreshCompanyBrief,
  type CompanyBrief,
} from "@/app/actions/companyBrief";

/* ===== 공통 타입 ===== */
type SectionKey = "basic" | "valuesCultureTalent" | "hiringPoints" | "tips" | "news";
type SourceMode = "official" | "mixed";

/* ===== 유틸: 기업명 정규화 + 콘텐츠 존재 여부 ===== */
function normalizeCompanyName(raw?: string) {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/^\s*(주식회사|㈜|\(주\)|Co\.\s*Ltd\.?|Inc\.?|Corp\.?)\s*/gi, "");
  s = s.replace(/\s*(주식회사|㈜|\(주\)|Co\.\s*Ltd\.?|Inc\.?|Corp\.?)\s*$/gi, "");
  const alias: Record<string, string> = {
    "기아자동차": "기아",
    "KIA MOTORS": "기아",
    "KIA": "기아",
    "LG에너지솔루션": "LG Energy Solution",
    "엔비디아": "NVIDIA",
    "구글": "Google",
  };
  const key = s.toUpperCase();
  for (const [k, v] of Object.entries(alias)) {
    if (key === k.toUpperCase()) return v;
  }
  return s;
}
function hasAnyBriefContent(b?: CompanyBrief | null) {
  return !!(
    b?.blurb ||
    b?.bullets?.length ||
    b?.values?.length ||
    b?.culture?.length ||
    b?.talentTraits?.length ||
    b?.hiringFocus?.length ||
    b?.resumeTips?.length ||
    b?.interviewTips?.length ||
    b?.recent?.length
  );
}

/* ===== 디버그 로거 ===== */
type DebugEvent = { time: string; msg: string };
function now() {
  return new Date().toLocaleTimeString();
}

/**
 * DocAiPanel — 내부 클래스 미세조정 (패널 자체는 라인/스티키/높이계산 X)
 * - 좌측 경계선: (이중선 제거) 패널 자체는 라인/그림자 없음
 * - 세로 높이/스티키: 바깥 래퍼가 담당 (sticky+100dvh)
 * - 우측 잘림: scrollbar-gutter 예약 + 우측 내부 여백 보강
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

  /* 출처 모드: official(공식/언론 위주), mixed(블로그/커뮤니티 포함) */
  const [sourceMode, setSourceMode] = useState<SourceMode>("official");

  const [brief, setBrief] = useState<CompanyBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefErr, setBriefErr] = useState("");

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

  /* ===== 디버그: 로그/모드 트래킹 ===== */
  const [debugOpen, setDebugOpen] = useState(false);
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [lastFetchMode, setLastFetchMode] = useState<Partial<Record<SectionKey, SourceMode>>>({});
  const logRef = useRef<HTMLDivElement | null>(null);

  const log = (msg: string) => {
    console.debug(`[DocAiPanel] ${msg}`);
    setEvents((prev) => [...prev, { time: now(), msg }]);
  };

  useEffect(() => {
    if (debugOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events, debugOpen]);

  /* ===== data fetch (초기: 공식 → 비었으면 혼합 자동 재시도) ===== */
  useEffect(() => {
    const raw = (company ?? "").trim();
    const c = normalizeCompanyName(raw);
    if (!c) {
      setBrief(null);
      setBriefErr("");
      setLastFetchMode({});
      setEvents([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        setBriefLoading(true);
        setBriefErr("");
        setEvents([]);
        log(`초기 로드 시작: 회사='${c}', role='${role ?? ""}' (모드: official 우선)`);
        // 1차: 공식 위주
        let data = await fetchCompanyBrief(c, role);
        log(`초기 fetchCompanyBrief 완료. 콘텐츠 유무: ${hasAnyBriefContent(data) ? "있음" : "없음"}`);

        // 비어 있으면 2차: 혼합(블로그 포함) 강제 재시도
        if (!hasAnyBriefContent(data)) {
          log("공식 데이터 비어있음 → 혼합(mixed) 폴백 시도: refreshCompanyBrief");
          try {
            const mixed = await refreshCompanyBrief(c, {
              role,
              section: "basic",
              strict: false,
              includeCommunity: true,
            } as const);
            log(`혼합 폴백 결과. 콘텐츠 유무: ${hasAnyBriefContent(mixed) ? "있음" : "없음"}`);
            if (hasAnyBriefContent(mixed)) {
              data = mixed;
              setLastFetchMode((p) => ({ ...p, basic: "mixed" }));
            } else {
              setLastFetchMode((p) => ({ ...p, basic: "official" }));
            }
          } catch (err: any) {
            log(`혼합 폴백 에러: ${err?.message || String(err)}`);
            setLastFetchMode((p) => ({ ...p, basic: "official" }));
          }
        } else {
          setLastFetchMode((p) => ({ ...p, basic: "official" }));
        }

        if (!alive) return;
        setBrief(data);
        setOpen({});
        setSecLoading({});
        setSecError({});
        setNewsPage(1);
        log("초기 로드 종료");
      } catch (e: any) {
        if (!alive) return;
        setBriefErr(e?.message || "회사 정보 불러오기 실패");
        setBrief(null);
        log(`초기 로드 실패: ${e?.message || e}`);
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

  /* 공식 실패 시 혼합 자동 폴백 + 디버그로그 */
  const refreshSection = async (key: SectionKey, forceMixed = false) => {
    if (!company) return;
    const c = normalizeCompanyName(company);
    setSecLoading((p) => ({ ...p, [key]: true }));
    setSecError((p) => ({ ...p, [key]: null }));
    try {
      const wantMixed = !!forceMixed;
      // official: 엄격(STRICT), 비공식 소스 제외
      const optsOfficial = { role, section: key, strict: true, includeCommunity: false } as const;
      // mixed: 느슨, 블로그/커뮤니티 포함
      const optsMixed = { role, section: key, strict: false, includeCommunity: true } as const;

      log(`섹션 재생성 시작 [${key}] — 시도 모드: ${wantMixed ? "mixed(강제)" : "official"}`);
      let data: CompanyBrief | null = null;
      try {
        const refreshed = await refreshCompanyBrief(c, wantMixed ? optsMixed : optsOfficial);
        data = refreshed ?? null;
        log(`refreshCompanyBrief(${wantMixed ? "mixed" : "official"}) 완료. 콘텐츠: ${hasAnyBriefContent(data) ? "있음" : "없음"}`);
      } catch (err: any) {
        log(`refreshCompanyBrief 에러(${wantMixed ? "mixed" : "official"}): ${err?.message || String(err)}`);
        data = null;
      }

      if (!hasAnyBriefContent(data) && !wantMixed) {
        log(`공식 결과 비어있음 → 혼합 폴백 재시도 [${key}]`);
        try {
          const second = await refreshCompanyBrief(c, optsMixed);
          data = second ?? data;
          log(`혼합 폴백 결과. 콘텐츠: ${hasAnyBriefContent(data) ? "있음" : "없음"}`);
          setLastFetchMode((p) => ({ ...p, [key]: hasAnyBriefContent(data) ? "mixed" : "official" }));
        } catch (err: any) {
          log(`혼합 폴백 에러: ${err?.message || String(err)}`);
          setLastFetchMode((p) => ({ ...p, [key]: "official" }));
        }
      } else {
        setLastFetchMode((p) => ({ ...p, [key]: wantMixed ? "mixed" : "official" }));
      }

      if (!data) {
        log(`refresh 결과 없음 → fetchCompanyBrief로 대체 조회 [${key}]`);
        data = await fetchCompanyBrief(c, role);
        log(`fetchCompanyBrief 대체 조회 완료. 콘텐츠: ${hasAnyBriefContent(data) ? "있음" : "없음"}`);
      }

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
      log(`섹션 재생성 종료 [${key}]`);
    } catch (e: any) {
      setSecError((p) => ({ ...p, [key]: e?.message || "섹션 로딩 실패" }));
      log(`섹션 재생성 실패 [${key}]: ${e?.message || e}`);
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
  const totalSources = brief?.sourceNotes?.length ?? 0;
  const hasAnyContentFlag = hasAnyBriefContent(brief);

  return (
    <>
      {/* 내부: sticky/높이/라인 없음 (바깥 래퍼가 담당) */}
      <aside
        className="
          w-full flex-none
          bg-white
          p-4
          overflow-y-auto overflow-x-hidden
          box-border break-words
          pr-2 scrollbar-gutter-stable
          text-[13px]
        "
        style={{
          overscrollBehavior: "contain",
          paddingRight: "max(0.5rem, env(safe-area-inset-right))",
        }}
      >
        {/* --- 상단: 회사 선택 요약 --- */}
        <div className="rounded-xl border p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-gray-500">선택한 회사</div>
              <div className="font-semibold text-lg leading-tight">{company || "—"}</div>
              {role && <div className="text-sm mt-0.5 text-gray-600">포지션: {role}</div>}
            </div>

            {/* 출처 모드 선택 + 마지막 시도 배지 */}
            <div className="flex flex-col items-end gap-1">
              <select
                value={sourceMode}
                onChange={(e) => setSourceMode(e.target.value as SourceMode)}
                className="text-[11px] border rounded px-2 py-1 bg-white"
                title="출처 범위를 선택합니다"
              >
                <option value="official">공식/언론만</option>
                <option value="mixed">블로그 포함</option>
              </select>
              <div
                className={
                  "text-[10px] px-1.5 py-0.5 rounded border " +
                  (sourceMode === "official"
                    ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                    : "text-amber-700 border-amber-200 bg-amber-50")
                }
                title={
                  sourceMode === "official"
                    ? "공식 페이지·보도자료·IR 등 신뢰도 높은 출처만 사용"
                    : "공식 출처가 부족하면 블로그/커뮤니티를 보조로 사용"
                }
              >
                {sourceMode === "official" ? "공식 모드" : "비공식 출처 포함"}
              </div>
              {lastFetchMode.basic && (
                <div
                  className={
                    "text-[10px] px-1.5 py-0.5 rounded border " +
                    (lastFetchMode.basic === "official"
                      ? "text-sky-700 border-sky-200 bg-sky-50"
                      : "text-amber-700 border-amber-200 bg-amber-50")
                  }
                  title="마지막 로드/재생성에 사용된 모드"
                >
                  마지막 시도: {lastFetchMode.basic === "official" ? "Official" : "Mixed"}
                </div>
              )}
            </div>
          </div>

          {/* 상단 상태 메시지 */}
          <div className="text-xs text-gray-500 mt-2">
            {briefLoading ? (
              "불러오는 중…"
            ) : briefErr ? (
              <span className="text-rose-600">{briefErr}</span>
            ) : hasAnyContentFlag ? (
              <>
                {totalSources > 0 ? (
                  <>출처 {totalSources}개를 기반으로 구성되었습니다.</>
                ) : (
                  <>
                    공식 출처가 부족합니다.{" "}
                    <button
                      className="underline underline-offset-2"
                      onClick={() => refreshSection("basic", true)}
                      title="블로그/커뮤니티 포함 모드로 재시도"
                    >
                      블로그 포함으로 재시도
                    </button>
                    를 눌러 보세요.
                  </>
                )}
              </>
            ) : (
              <>
                아직 표시할 내용이 없습니다.{" "}
                <button
                  className="underline underline-offset-2"
                  onClick={() => refreshSection("basic", true)}
                  title="블로그/커뮤니티 포함 모드로 재시도"
                >
                  블로그 포함으로 재시도
                </button>
                를 권장합니다.
              </>
            )}
          </div>

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
                const html = buildRichHtml(brief, sourceMode);
                // 에디터에 리치 HTML 삽입 (호환용)
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
                  const c = normalizeCompanyName(company);
                  const data = await fetchCompanyBrief(c, role);
                  setBrief(data);
                  setLastFetchMode((p) => ({ ...p, basic: "official" }));
                  log("수동 새로고침: fetchCompanyBrief(official) 완료");
                } finally {
                  setBriefLoading(false);
                }
              }}
            >
              새로고침
            </button>
            <button
              className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
              onClick={async () => {
                if (!company) return;
                setBriefLoading(true);
                try {
                  const c = normalizeCompanyName(company);
                  log(`수동 재생성(현재 출처 모드=${sourceMode})`);
                  const data = await refreshCompanyBrief(c, {
                    role,
                    strict: sourceMode === "official",
                    includeCommunity: sourceMode !== "official",
                  } as const);
                  setBrief(data);
                  setLastFetchMode((p) => ({ ...p, basic: sourceMode }));
                } finally {
                  setBriefLoading(false);
                }
              }}
              disabled={briefLoading}
            >
              {briefLoading ? "재생성 중…" : "재생성(현재 출처 모드)"}
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
          sourceMode={sourceMode}
          lastFetchMode={lastFetchMode}
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

        {/* --- 디버그 로그 패널 --- */}
        <div className="rounded-xl border p-3 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-700">🛠 디버그 로그</div>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
                onClick={() => setDebugOpen((v) => !v)}
              >
                {debugOpen ? "접기" : "펼치기"}
              </button>
              <button
                className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
                onClick={() => setEvents([])}
              >
                로그 비우기
              </button>
            </div>
          </div>
          {debugOpen && (
            <div
              ref={logRef}
              className="mt-2 h-32 overflow-auto rounded border bg-gray-50 p-2 font-mono text-[11px] leading-5"
            >
              {events.length === 0 ? (
                <div className="text-gray-400">로그가 없습니다.</div>
              ) : (
                events.map((e, i) => (
                  <div key={i}>
                    <span className="text-gray-500 mr-2">{e.time}</span>
                    <span>{e.msg}</span>
                  </div>
                ))
              )}
            </div>
          )}
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
                  title={r.blurb || ""}
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
  open: Partial<Record<SectionKey, boolean>>;
  secLoading: Partial<Record<SectionKey, boolean>>;
  secError: Partial<Record<SectionKey, string | null>>;
  toggle: (k: SectionKey) => void;
  refreshSection: (k: SectionKey, forceMixed?: boolean) => void;
  newsPage: number;
  setNewsPage: (fn: (p: number) => number) => void;
  NEWS_PAGE_SIZE: number;
  sourceMode: SourceMode;
  lastFetchMode: Partial<Record<SectionKey, SourceMode>>;
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
    sourceMode,
    lastFetchMode,
  } = props;

  const keys: SectionKey[] = ["basic", "valuesCultureTalent", "hiringPoints", "tips", "news"];
  const LABEL: Record<SectionKey, string> = {
    basic: "기본 회사 브리프",
    valuesCultureTalent: "핵심가치 · 조직문화 · 인재상",
    hiringPoints: "채용 포인트",
    tips: "서류 · 면접 팁",
    news: "최근 뉴스",
  };

  return (
    <div className="flex flex-col gap-2 mt-4">
      {keys.map((key) => {
        const empty =
          !brief ||
          (key === "basic" && !((brief.blurb && brief.blurb.trim()) || (brief.bullets && brief.bullets.length))) ||
          (key === "valuesCultureTalent" &&
            !((brief.values && brief.values.length) ||
              (brief.culture && brief.culture.length) ||
              (brief.talentTraits && brief.talentTraits.length))) ||
          (key === "hiringPoints" && !(brief.hiringFocus && brief.hiringFocus.length)) ||
          (key === "tips" &&
            !((brief.resumeTips && brief.resumeTips.length) ||
              (brief.interviewTips && brief.interviewTips.length))) ||
          (key === "news" && !(brief.recent && brief.recent.length));

        const lastMode = lastFetchMode[key];

        return (
          <div key={key} className="rounded-xl border">
            <button onClick={() => toggle(key)} className="w-full text-left p-3 hover:bg-gray-50 rounded-t-xl">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className={`inline-block transition-transform ${open[key] ? "rotate-90" : ""}`}>▸</span>
                  <span className="text-[14px] font-semibold">{LABEL[key]}</span>
                </div>
                <div className="flex items-center gap-2">
                  {lastMode && (
                    <span
                      className={
                        "text-[10px] px-1.5 py-0.5 rounded border " +
                        (lastMode === "official"
                          ? "text-sky-700 border-sky-200 bg-sky-50"
                          : "text-amber-700 border-amber-200 bg-amber-50")
                      }
                      title="이 섹션의 마지막 시도 모드"
                    >
                      마지막: {lastMode === "official" ? "Official" : "Mixed"}
                    </span>
                  )}
                  {secLoading[key] && <span className="text-xs text-gray-500">갱신 중…</span>}
                  {empty && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void refreshSection(key, true);
                      }}
                      className="text-xs rounded-md border px-2 py-1 hover:bg-gray-50"
                      title="블로그 포함 모드로 재시도"
                    >
                      블로그 포함 재시도
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void refreshSection(key);
                    }}
                    className="text-xs rounded-md border px-2 py-1 hover:bg-gray-50"
                  >
                    {secLoading[key] ? "재생성 중…" : "재생성"}
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
                  setNewsPage,
                  sourceMode
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderSectionBody(
  key: SectionKey,
  brief: CompanyBrief | null,
  busy?: boolean,
  err?: string | null,
  newsPage?: number,
  NEWS_PAGE_SIZE?: number,
  setNewsPage?: (fn: (p: number) => number) => void,
  sourceMode?: SourceMode
) {
  if (busy) return <div className="text-sm text-gray-500 animate-pulse">불러오는 중…</div>;
  if (err) return <div className="text-sm text-rose-600">오류: {err}</div>;
  if (!brief) return <div className="text-sm text-gray-500">데이터가 없습니다.</div>;

  const UnofficialBadge =
    sourceMode === "mixed" ? (
      <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block mb-2">
        비공식 출처 일부 포함(검증 필요)
      </div>
    ) : null;

  if (key === "news") {
    const list = brief.recent ?? [];
    if (!list.length)
      return (
        <div className="text-sm text-gray-500">
          표시할 뉴스가 없습니다. 필요하면 상단에서 ‘블로그 포함’ 모드로 전환해 보세요.
        </div>
      );
    const end = Math.min(list.length, (newsPage ?? 1) * (NEWS_PAGE_SIZE ?? 5));
    const pageItems = list.slice(0, end);

    return (
      <div className="space-y-3">
        {UnofficialBadge}
        {pageItems.map((n, i) => (
          <div key={`${n.url ?? n.title}-${i}`} className="rounded-lg border p-3 hover:bg-gray-50 transition">
            <div className="font-medium text-[13px] break-words">
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
    if (!has)
      return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘블로그 포함 재시도’를 눌러 보세요.</div>;
    return (
      <div className="prose max-w-none whitespace-pre-wrap break-words [&_p]:text-[13px] [&_li]:text-[13px]">
        {UnofficialBadge}
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
    if (!blocks.length)
      return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘블로그 포함 재시도’를 눌러 보세요.</div>;
    return (
      <div className="space-y-3">
        {UnofficialBadge}
        {blocks}
      </div>
    );
  }

  if (key === "hiringPoints") {
    if (!brief.hiringFocus?.length)
      return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘블로그 포함 재시도’를 눌러 보세요.</div>;
    return (
      <div>
        {UnofficialBadge}
        <ListBlock title="채용 포인트" items={brief.hiringFocus} />
      </div>
    );
  }

  if (key === "tips") {
    const blocks: JSX.Element[] = [];
    if (brief.resumeTips?.length) blocks.push(<ListBlock key="r" title="서류 팁" items={brief.resumeTips} marker="-" />);
    if (brief.interviewTips?.length) blocks.push(<ListBlock key="i" title="면접 팁" items={brief.interviewTips} marker="-" />);
    if (!blocks.length)
      return <div className="text-sm text-gray-500">내용이 비어 있습니다. ‘블로그 포함 재시도’를 눌러 보세요.</div>;
    return (
      <div className="space-y-3">
        {UnofficialBadge}
        {blocks}
      </div>
    );
  }

  return null;
}

function ListBlock({ title, items, marker = "•" }: { title: string; items: string[]; marker?: "•" | "-" }) {
  return (
    <div>
      <div className="font-semibold break-words text-[14px]">{title}</div>
      <ul className="list-disc pl-5 space-y-1 text-[13px]">
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

function buildRichHtml(brief: CompanyBrief, mode: SourceMode) {
  const vals = renderList("핵심 가치", brief.values);
  const cult = renderList("조직문화", brief.culture);
  const talent = renderList("인재상", brief.talentTraits);
  const hire = renderList("채용에서 중요하게 보는 포인트", brief.hiringFocus);
  const resume = renderList("서류 합격 Tip", brief.resumeTips);
  const inter = renderList("면접 Tip", brief.interviewTips);
  const news = renderNews("최근 이슈 / 뉴스", brief.recent);
  const unofficial =
    mode === "mixed"
      ? `<div class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block">비공식 출처 일부 포함(검증 필요)</div>`
      : "";
  const sources =
    brief.sourceNotes?.length
      ? `<div class="mt-2 text-[11px] text-gray-500">출처: ${escapeHtml(brief.sourceNotes.join(", "))}</div>`
      : "";
  return `
<section class="rounded-xl border bg-white p-4 my-4">
  <h3 class="font-bold text-[15px] mb-2">🏢 회사 브리프 — ${escapeHtml(brief.company)}${
    brief.role ? ` / ${escapeHtml(brief.role)}` : ""
  }</h3>
  ${unofficial}
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
