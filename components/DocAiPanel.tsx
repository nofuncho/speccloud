"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiMode } from "@/app/actions/aiActions";
import { runAi } from "@/app/actions/aiActions";
import {
  fetchCompanyBrief,
  listRecentCompanyBriefs,
  refreshCompanyBrief, // ✅ 강제 재생성 API 추가 임포트
  type CompanyBrief,
} from "@/app/actions/companyBrief";

/**
 * 문서 편집기 우측 AI 패널 (확장판)
 * - 회사/포지션 선택 시 회사 브리프 자동 표시 (DB 캐시 + 확장 섹션 + 뉴스 병합)
 * - 최근 회사 요약 목록 제공
 * - 선택 텍스트를 회사 컨텍스트와 함께 AI로 처리
 * - 문서에 텍스트/리치(HTML) 삽입 버튼 제공
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
  replaceSelection: (text: string) => void; // 텍스트 치환(기존 방식)
}) {
  const [mode, setMode] = useState<AiMode>("proofread");
  const [tone, setTone] = useState("차분하고 전문적");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  // 회사 브리프(현재 선택)
  const [brief, setBrief] = useState<CompanyBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefErr, setBriefErr] = useState("");
  const [useContext, setUseContext] = useState(true);

  // 최근 회사 요약
  const [recent, setRecent] = useState<CompanyBrief[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  /** 회사/포지션 변경 시: 브리프 로드 */
  useEffect(() => {
    const c = (company ?? "").trim();
    if (!c) {
      setBrief(null);
      return;
    }

    let alive = true;
    (async () => {
      setBriefLoading(true);
      setBriefErr("");
      try {
        const data = await fetchCompanyBrief(c, role);
        if (!alive) return;
        setBrief(data);
      } catch (e: any) {
        if (!alive) return;
        setBriefErr(e?.message || "회사 정보 불러오기 실패");
      } finally {
        if (alive) setBriefLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [company, role]);

  /** 패널 마운트 시: 최근 회사 요약 리스트 */
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

  /** 회사 브리프 텍스트 (AI 프롬프트 컨텍스트용) */
  const briefText = useMemo(() => {
    if (!brief) return "";
    const lines: string[] = [];

    // 기본 요약
    if (brief.blurb?.trim()) lines.push(brief.blurb.trim());
    const bullets = (brief.bullets ?? []).map((b) => (b.startsWith("•") ? b : `• ${b}`));
    if (bullets.length) lines.push(bullets.join("\n"));

    // 확장 섹션
    if (brief.values?.length) lines.push(`\n[핵심 가치]\n${brief.values.map(prefixDot).join("\n")}`);
    if (brief.hiringFocus?.length)
      lines.push(`\n[채용 포인트]\n${brief.hiringFocus.map(prefixDot).join("\n")}`);
    if (brief.resumeTips?.length)
      lines.push(`\n[서류 팁]\n${brief.resumeTips.map(prefixDash).join("\n")}`);
    if (brief.interviewTips?.length)
      lines.push(`\n[면접 팁]\n${brief.interviewTips.map(prefixDash).join("\n")}`);

    // 최근 뉴스 제목만
    if (brief.recent?.length) {
      const newsHeads = brief.recent
        .slice(0, 5)
        .map((n) => `• ${n.title}${n.source ? ` (${n.source})` : ""}${n.date ? ` - ${formatDate(n.date)}` : ""}`);
      if (newsHeads.length) lines.push(`\n[최근 뉴스]\n${newsHeads.join("\n")}`);
    }

    return lines.join("\n").trim();
  }, [brief]);

  /** AI 실행 */
  const onRun = async () => {
    const selected = getSelectionHtml()?.trim();
    if (!selected) {
      setError("먼저 문서를 선택해주세요.");
      setTimeout(() => setError(""), 2000);
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
    } catch (err) {
      console.error(err);
      setError("AI 요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** 결과 적용(텍스트 치환) */
  const onApply = () => {
    if (!preview.trim()) return;
    replaceSelection(preview);
    setPreview("");
  };

  /** 내부 HTML 삽입 도우미(리치 블록) */
  const insertHtmlLocal = (html: string) => {
    try {
      // contentEditable 기반 에디터에서 동작 (TipTap 등에서도 대부분 수용)
      document.execCommand("insertHTML", false, html);
    } catch {
      // 실패 시 텍스트로 폴백
      replaceSelection(stripHtml(html));
    }
  };

  /** 회사 브리프 리치 블록 HTML */
  const briefHtml = useMemo(() => {
    if (!brief) return "";
    const vals = renderList("핵심 가치", brief.values);
    const hire = renderList("채용에서 중요하게 보는 포인트", brief.hiringFocus);
    const resume = renderList("서류 합격 Tip", brief.resumeTips);
    const inter = renderList("면접 Tip", brief.interviewTips);
    const news = renderNews("최근 이슈 / 뉴스", brief.recent);

    return `
<section class="rounded-xl border bg-white p-4 my-4">
  <h3 class="font-bold text-[15px] mb-2">🏢 회사 브리프 — ${escapeHtml(brief.company)}${brief.role ? ` / ${escapeHtml(brief.role)}` : ""}</h3>
  <p class="text-[13px] text-gray-700 mb-2">${escapeHtml(brief.blurb)}</p>
  ${vals}${hire}${resume}${inter}${news}
  <div class="mt-2 text-[11px] text-gray-400">업데이트: ${escapeHtml(
    new Date(brief.updatedAt).toLocaleDateString()
  )}</div>
</section>`.trim();
  }, [brief]);

  return (
    <aside className="w-80 shrink-0 border-l bg-white flex flex-col">
      {/* 헤더 */}
      <div className="border-b px-4 py-3 font-semibold flex items-center justify-between">
        <span>✨ AI 도우미</span>
        {loading && <span className="text-xs text-gray-400">생성 중...</span>}
      </div>

      {/* 회사 브리프 카드 */}
      <div className="p-3 border-b bg-white">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-gray-700">🏷 회사 브리프</div>
          <label className="text-[11px] inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setUseContext(e.target.checked)}
            />
            프롬프트에 포함
          </label>
        </div>

        {briefLoading ? (
          <div className="text-xs text-gray-500">불러오는 중…</div>
        ) : briefErr ? (
          <div className="text-xs text-rose-600">{briefErr}</div>
        ) : brief ? (
          <div className="text-xs text-gray-700 space-y-2">
            <div className="font-medium">
              {brief.company}
              {brief.role ? ` · ${brief.role}` : ""}
            </div>

            {/* 핵심 요약 */}
            <div className="text-gray-600">{brief.blurb}</div>

            {/* bullets (요약) */}
            {brief.bullets?.length ? (
              <ul className="list-disc pl-4 space-y-1">
                {brief.bullets.slice(0, 5).map((b, i) => (
                  <li key={i} className="leading-snug">
                    {b.replace(/^•\s?/, "")}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 확장 섹션 요약 프리뷰 */}
            {brief.values?.length ? (
              <SectionPreview title="핵심 가치" items={brief.values} />
            ) : null}
            {brief.hiringFocus?.length ? (
              <SectionPreview title="채용 포인트" items={brief.hiringFocus} />
            ) : null}
            {brief.resumeTips?.length ? (
              <SectionPreview title="서류 팁" items={brief.resumeTips} />
            ) : null}
            {brief.interviewTips?.length ? (
              <SectionPreview title="면접 팁" items={brief.interviewTips} />
            ) : null}

            {/* 최근 뉴스 */}
            {brief.recent?.length ? (
              <div>
                <div className="font-semibold mt-1">최근 뉴스</div>
                <ul className="list-disc pl-4 space-y-1">
                  {brief.recent.slice(0, 5).map((n, i) => (
                    <li key={i} className="leading-snug">
                      {n.url ? (
                        <a
                          href={n.url}
                          target="_blank"
                          className="underline"
                          rel="noreferrer"
                          title={n.source || ""}
                        >
                          {n.title}
                        </a>
                      ) : (
                        n.title
                      )}
                      {(n.source || n.date) && (
                        <span className="text-[11px] text-gray-500 ml-1">
                          {n.source ? `· ${n.source}` : ""} {n.date ? `· ${formatDate(n.date)}` : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 액션 */}
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
                onClick={() => replaceSelection(buildPlainBlock(brief))}
              >
                문서에 삽입(텍스트)
              </button>
              <button
                className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
                onClick={() => {
                  if (!briefHtml) return;
                  insertHtmlLocal(briefHtml);
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
                    const data = await fetchCompanyBrief(company, role); // TTL 지나면 재생성
                    setBrief(data);
                  } finally {
                    setBriefLoading(false);
                  }
                }}
              >
                새로고침
              </button>

              {/* ✅ 강제 재생성 버튼 (캐시 무시) */}
              <button
                className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
                onClick={async () => {
                  if (!company) return;
                  setBriefLoading(true);
                  try {
                    const data = await refreshCompanyBrief(company, role); // ✅ 캐시 무시하고 즉시 재생성
                    setBrief(data);
                  } finally {
                    setBriefLoading(false);
                  }
                }}
              >
                강제 재생성
              </button>

              <span className="text-[10px] text-gray-400 self-center">
                {new Date(brief.updatedAt).toLocaleDateString()} 기준
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-gray-400">
            상단에서 회사/포지션을 선택하면 자동으로 요약이 표시됩니다.
          </div>
        )}
      </div>

      {/* 최근 회사 요약 */}
      <div className="p-3 border-b bg-white">
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

      {/* 본문 (모드/옵션) */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {/* 모드 선택 */}
        <div>
          <label className="text-sm font-medium block mb-1">작업 모드</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AiMode)}
            className="w-full border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="proofread">맞춤법 / 가독성 첨삭</option>
            <option value="rewrite_tone">톤 변경</option>
            <option value="summarize">요약</option>
            <option value="keywords">핵심 키워드 추출</option>
            <option value="translate_en">영문 번역</option>
            <option value="translate_ko">한글 번역</option>
            <option value="expand">🧩 내용 보충(확장)</option>
          </select>
        </div>

        {/* 톤 옵션 */}
        {(mode === "rewrite_tone" || mode === "expand") && (
          <div>
            <label className="text-sm font-medium block mb-1">톤 설정</label>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              placeholder="예: 자신감 있고 간결"
            />
          </div>
        )}

        {/* 실행 버튼 */}
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full bg-black text-white text-sm py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {loading ? "AI 처리 중..." : (mode === "expand" ? "선택 내용 보충" : "선택 영역 첨삭")}
        </button>

        {error && <div className="text-xs text-red-500">{error}</div>}

        {/* 결과 미리보기 */}
        {preview && (
          <div className="mt-2 border rounded-lg p-3 bg-gray-50 whitespace-pre-wrap text-sm overflow-y-auto max-h-72">
            {preview}
          </div>
        )}
      </div>

      {/* 적용 버튼 */}
      {preview && (
        <div className="border-t p-3">
          <button
            onClick={onApply}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg transition"
          >
            이 내용으로 대체하기
          </button>
        </div>
      )}
    </aside>
  );
}

/* =========================
 * 소형 프레젠터/유틸
 * ========================= */

function SectionPreview({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="font-semibold">{title}</div>
      <ul className="list-disc pl-4 space-y-1">
        {items.slice(0, 4).map((t, i) => (
          <li key={i} className="leading-snug">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildPlainBlock(b: CompanyBrief): string {
  const lines: string[] = [];
  lines.push(`🏢 회사 브리프 — ${b.company}${b.role ? ` / ${b.role}` : ""}`);
  lines.push(b.blurb);

  const pushList = (label: string, arr?: string[]) => {
    if (!arr || arr.length === 0) return;
    lines.push(`\n${label}`);
    arr.forEach((x) => lines.push(prefixDot(x)));
  };

  // 기본 bullets
  if (b.bullets?.length) {
    lines.push("\n핵심 요약");
    b.bullets.forEach((x) => lines.push(x.startsWith("•") ? x : `• ${x}`));
  }

  // 확장
  pushList("핵심 가치", b.values);
  pushList("채용 포인트", b.hiringFocus);
  pushList("서류 팁", b.resumeTips);
  pushList("면접 팁", b.interviewTips);

  // 뉴스
  if (b.recent?.length) {
    lines.push("\n최근 뉴스");
    b.recent.slice(0, 5).forEach((n) => {
      const meta = [n.source, formatDate(n.date)].filter(Boolean).join(" · ");
      lines.push(`• ${n.title}${meta ? ` (${meta})` : ""}${n.url ? ` <${n.url}>` : ""}`);
    });
  }

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
        ? `<a href="${escapeAttr(n.url)}" target="_blank" class="underline">${escapeHtml(n.title)}</a>`
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
function stripHtml(html: string) {
  if (typeof window === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
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
