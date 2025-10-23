"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type StepKey = "setup" | "ai" | "score" | "done";
const STORAGE_KEY = "speccloud.onboarding.v1";

// (다른 화면에서 단계 완료 시 호출)
export function markOnboardingStepDone(step: Exclude<StepKey, "done">) {
  const order: Exclude<StepKey, "done">[] = ["setup", "ai", "score"];
  const saved = (typeof window !== "undefined"
    ? (localStorage.getItem(STORAGE_KEY) as StepKey | null)
    : null) ?? "setup";
  if (saved === "done") return;
  const curIdx = order.indexOf(saved as any);
  const doneIdx = order.indexOf(step);
  const nextIdx = Math.max(curIdx, doneIdx) + 1;
  const next: StepKey = nextIdx >= order.length ? "done" : order[nextIdx];
  localStorage.setItem(STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent("onboarding:changed", { detail: next }));
}

type Props = {
  onSetupClick?: () => void;   // 기초세팅 버튼
  onAiGuideClick?: () => void; // AI 사용법 버튼
  onScoreClick?: () => void;   // 점수 측정 버튼
  doneBanner?: React.ReactNode; // 온보딩 끝나면 노출될 일반 배너
  imageSrc?: string;            // 기본: /chaltteok.png
};

export default function OnboardingBanner({
  onSetupClick,
  onAiGuideClick,
  onScoreClick,
  doneBanner,
  imageSrc = "/chaltteok.png",
}: Props) {
  const [step, setStep] = useState<StepKey>("setup");

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as StepKey | null) ?? "setup";
    setStep(saved);
    const handler = (e: any) => setStep(e.detail as StepKey);
    window.addEventListener("onboarding:changed", handler);
    return () => window.removeEventListener("onboarding:changed", handler);
  }, []);

  const content = useMemo(() => {
    if (step === "done") {
      return (
        doneBanner ?? (
          <div className="flex items-center gap-3">
            <Image src={imageSrc} alt="" width={44} height={44} className="rounded-full" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">이제 본격적으로 시작!</p>
              <p className="text-xs text-gray-500 truncate">새 문서를 만들거나 업로드해보세요.</p>
            </div>
          </div>
        )
      );
    }

    const map = {
      setup: {
        title: "빠른 기초 세팅",
        desc: "루트/예시 템플릿/샘플 문서 준비",
        cta: "기초세팅 시작",
        onClick: onSetupClick,
      },
      ai: {
        title: "AI 사용법 가이드",
        desc: "JD 붙여넣기, 리라이팅 체험",
        cta: "AI 가이드 열기",
        onClick: onAiGuideClick,
      },
      score: {
        title: "스펙 점수 측정",
        desc: "작성 문서 기반 점수 계산",
        cta: "점수 측정하기",
        onClick: onScoreClick,
      },
    } as const;

    const item = map[step];
    return (
      <>
        <div className="flex items-center gap-3">
          <Image src={imageSrc} alt="" width={44} height={44} className="rounded-full" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800">{item.title}</p>
            <p className="text-xs text-gray-500 truncate">{item.desc}</p>
          </div>
        </div>
        <button
          onClick={item.onClick}
          className="mt-3 w-full rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
        >
          {item.cta}
        </button>
        <div className="mt-3 flex items-center gap-1">
          {["setup", "ai", "score"].map((k) => {
            const active =
              (step === "setup" && k === "setup") ||
              (step === "ai" && k === "ai") ||
              (step === "score" && k === "score");
            const done =
              step === "done" ||
              (step === "ai" && k === "setup") ||
              (step === "score" && (k === "setup" || k === "ai"));
            return (
              <span
                key={k}
                className={[
                  "h-1.5 w-full rounded-full",
                  done ? "bg-blue-500" : active ? "bg-blue-300" : "bg-gray-200",
                ].join(" ")}
              />
            );
          })}
        </div>
      </>
    );
  }, [step, doneBanner, imageSrc, onSetupClick, onAiGuideClick, onScoreClick]);

  return <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">{content}</aside>;
}
