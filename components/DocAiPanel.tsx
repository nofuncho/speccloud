"use client";

import { useState } from "react";
import type { AiMode } from "@/app/actions/aiActions";
import { runAi } from "@/app/actions/aiActions";

/** 
 * 문서 편집기 우측에 붙는 AI 패널 컴포넌트
 * @param getSelectionHtml : 현재 선택된 텍스트 추출 함수
 * @param replaceSelection : AI 결과로 선택 영역 대체 함수
 */
export default function DocAiPanel({
  getSelectionHtml,
  replaceSelection,
}: {
  getSelectionHtml: () => string;
  replaceSelection: (text: string) => void;
}) {
  const [mode, setMode] = useState<AiMode>("proofread");
  const [tone, setTone] = useState("차분하고 전문적");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

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
      const result = await runAi(mode, selected, { tone });
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

      {/* 본문 */}
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
            <option value="expand">내용 보충(확장)</option>
          </select>
        </div>

        {/* 톤 변경 옵션 */}
        {mode === "rewrite_tone" && (
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
          {loading ? "AI 처리 중..." : "선택 영역 첨삭"}
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
