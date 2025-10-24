"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiMode } from "@/app/actions/aiActions";
import { runAi } from "@/app/actions/aiActions";
import {
  fetchCompanyBrief,
  listRecentCompanyBriefs,
  type CompanyBrief,
} from "@/app/actions/companyBrief";

/**
 * 문서 편집기 우측 AI 패널
 * - 회사/포지션 선택 시 회사 브리프 자동 표시 (DB 캐시)
 * - 최근 회사 요약 목록 제공
 * - 선택 텍스트를 회사 컨텍스트와 함께 AI로 처리
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
    const bullets = (brief.bullets ?? [])
      .map((b) => (b.startsWith("•") ? b : `• ${b}`))
      .join("\n");
    return `${brief.blurb}\n${bullets}`;
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

  /** 결과 적용 */
  const onApply = () => {
    if (!preview.trim()) return;
    replaceSelection(preview);
    setPreview("");
  };

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
            <div className="text-gray-600">{brief.blurb}</div>
            <ul className="list-disc pl-4 space-y-1">
              {brief.bullets.slice(0, 5).map((b, i) => (
                <li key={i} className="leading-snug">
                  {b.replace(/^•\s?/, "")}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-1">
              <button
                className="text-[11px] px-2 py-1 rounded border bg-white hover:bg-gray-50"
                onClick={() => replaceSelection(`${brief.blurb}\n${brief.bullets.join("\n")}`)}
              >
                문서에 삽입
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
                onClick={() =>
                  replaceSelection(
                    `${r.company}${r.role ? ` · ${r.role}` : ""}\n${r.blurb}\n${r.bullets.join("\n")}`
                  )
                }
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
