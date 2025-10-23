// components/RegenerateButtons.tsx
"use client";

import { useState, useTransition } from "react";
import { regenerateDocument } from "@/app/actions/regenerateActions";
import { useRouter } from "next/navigation";

type Props = {
  variant?: "row" | "column";
  size?: "sm" | "md";
  showCoverLetter?: boolean; // 기본 true
  showResume?: boolean;      // 기본 true
};

export default function RegenerateButtons({
  variant = "row",
  size = "md",
  showCoverLetter = true,
  showResume = true,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string>("");
  const router = useRouter();

  const cls =
    size === "sm"
      ? "px-3 py-1.5 text-xs rounded-lg"
      : "px-4 py-2 text-sm rounded-xl";
  const layout = variant === "row" ? "flex-row gap-2" : "flex-col gap-2";

  const run = (kind: "resume" | "coverletter") => {
    setMsg("");
    startTransition(async () => {
      try {
        const res = await regenerateDocument(kind);
        setMsg(`${res.title} 생성 완료`);
        router.refresh();
      } catch (e: any) {
        setMsg(e?.message || "생성 실패");
      }
    });
  };

  return (
    <div className={`flex ${layout}`}>
      {showResume && (
        <button
          disabled={pending}
          onClick={() => run("resume")}
          className={`${cls} bg-black text-white hover:opacity-90 disabled:opacity-50`}
        >
          {pending ? "생성 중..." : "이력서 AI로 다시 생성"}
        </button>
      )}
      {showCoverLetter && (
        <button
          disabled={pending}
          onClick={() => run("coverletter")}
          className={`${cls} border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50`}
        >
          {pending ? "생성 중..." : "자기소개서 AI로 다시 생성"}
        </button>
      )}
      {!!msg && <span className="self-center text-xs text-gray-500 ml-1">{msg}</span>}
    </div>
  );
}
