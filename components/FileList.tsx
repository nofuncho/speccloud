"use client";

import { useSpecStore } from "@/store/useSpecStore";
import { FileText, BadgeCheck, Paperclip } from "lucide-react";

export default function FileList() {
  const { files } = useSpecStore();

  return (
    <section className="h-[calc(100vh-84px)] overflow-auto scroll-thin">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="font-medium">문서</div>
        <div className="text-xs text-gray-500">이름 · 수정일 · 회사명</div>
      </div>

      <div className="divide-y">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 p-4 hover:bg-gray-50">
            <FileText className="h-5 w-5 text-blue-500" />
            <div className="flex-1">
              <div className="text-sm font-medium">{f.title}</div>
              <div className="text-xs text-gray-500">{f.company} · {f.updatedAt}</div>
            </div>
            {f.status === "ai-reviewed" && (
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 text-xs px-2 py-1 rounded-full">
                <BadgeCheck className="h-3.5 w-3.5" /> AI 검토완료
              </span>
            )}
            {f.hasProof && (
              <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 text-xs px-2 py-1 rounded-full ml-2">
                <Paperclip className="h-3.5 w-3.5" /> 증빙 링크드
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
