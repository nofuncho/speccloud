// components/OnboardingImport.tsx
"use client";

import { useRef, useState } from "react";

type Props = { onDone?: () => void };

export default function ImportStarter({ onDone }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (f: File) => {
    setBusy(true);
    try {
      // TODO: 서버 액션으로 업로드 & 파싱 후 문서 생성
      // await importDocumentAction(f)
      onDone?.();
    } catch (e) {
      alert("가져오기 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        PDF, DOCX, MD 파일을 업로드하면 에디터에서 바로 편집 가능한 문서로 변환해요.
      </p>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.md,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "업로드 중..." : "파일 선택"}
        </button>
      </div>
      <div className="text-xs text-gray-500">
        ※ 이미지 기반 PDF는 정확도가 낮을 수 있어요. 텍스트 PDF 권장.
      </div>
    </div>
  );
}
