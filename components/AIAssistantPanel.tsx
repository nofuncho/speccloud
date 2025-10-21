"use client";

import { useState } from "react";

export default function AIAssistantPanel() {
  const [jd, setJd] = useState("");
  const [text, setText] = useState("");
  const [out, setOut] = useState("");

  return (
    <aside className="h-[calc(100vh-84px)] overflow-auto scroll-thin">
      <div className="p-4 border-b border-gray-100">
        <div className="font-medium">AI 도우미</div>
        <p className="text-xs text-gray-500 mt-1">JD 붙여넣기 → 갭 분석 → 리라이팅 제안</p>
      </div>

      <div className="p-4 space-y-3">
        <label className="text-xs text-gray-600">JD 텍스트</label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          className="w-full h-24 p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-sky"
        />

        <label className="text-xs text-gray-600">내 자소서</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-24 p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-sky"
        />

        <button
          className="w-full py-2 rounded-xl bg-brand-sky text-white text-sm hover:opacity-90"
          onClick={() => {
            if (!jd || !text) { setOut("JD와 자소서를 입력해주세요."); return; }
            setOut("👀 키워드 갭(예시): 데이터 분석, 캠페인 성과지표, SQL\n\n"
              + "✍️ 리라이팅 제안(예시):\n- STAR 구조 기반으로 성과 수치(CTR, ROAS 등) 명확화\n- JD 키워드 중 누락 키워드 반영\n- 톤 전환: 담백/임팩트 토글");
          }}
        >
          AI 제안 생성 (샘플)
        </button>

        {out && (
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
            {out}
          </pre>
        )}
      </div>
    </aside>
  );
}
