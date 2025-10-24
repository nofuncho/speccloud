// components/OnboardingBanner.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import OnboardingModal from "./OnboardingModal";
import OnboardingChat from "./OnboardingChat";

const K1 = "ob_step1_done";
const K2 = "ob_step2_done";
const K3 = "ob_step3_done";

type StepId = 1 | 2 | 3;

export default function OnboardingBanner() {
  const [done, setDone] = useState<{ 1: boolean; 2: boolean; 3: boolean }>({ 1: false, 2: false, 3: false });
  const [activeStep, setActiveStep] = useState<StepId | null>(null);

  useEffect(() => {
    setDone({
      1: localStorage.getItem(K1) === "1",
      2: localStorage.getItem(K2) === "1",
      3: localStorage.getItem(K3) === "1",
    });
  }, []);

  const currentStep: StepId = useMemo(() => {
    if (!done[1]) return 1;
    if (!done[2]) return 2;
    if (!done[3]) return 3;
    return 3;
  }, [done]);

  const openStep = (id: StepId) => setActiveStep(id);
  const close = () => setActiveStep(null);
  const markDone = (id: StepId) => {
    const map = { 1: K1, 2: K2, 3: K3 } as const;
    localStorage.setItem(map[id], "1");
    setDone(prev => ({ ...prev, [id]: true }));
  };

  return (
    <>
      {/* 💡 작은 사이즈 배너 */}
      <div
        onClick={() => openStep(currentStep)}
        className="relative cursor-pointer rounded-[14px] bg-[#F3F7FF] pl-4 pr-3 py-5 overflow-hidden"
        style={{ minHeight: 90 }}
      >
        <div className="flex items-center">
          {/* 텍스트 */}
          <div className="flex-1 pr-[70px]">
            <div className="text-[15px] sm:text-[16px] leading-[1.3] font-extrabold tracking-[-0.01em] text-gray-900">
              찰떡이와 함께<br />쉽게 기초 세팅 시작
            </div>
            <div className="mt-[4px] text-[12px] text-[#6B7280]">
              AI 기능들을 위해 필요해요
            </div>

            {/* 게이지 (소형)
            <div className="mt-2 flex items-center gap-[6px]">
            <div className="h-[6px] w-[20px] rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]" />
            <div className="h-[6px] w-[20px] rounded-full bg-[#E5EBF7]" />
            <div className="h-[6px] w-[20px] rounded-full bg-[#E5EBF7]" />
            </div>
            */}
          </div>

          {/* 캐릭터 */}
            <Image
            src="/onboarding/character.png"
            alt="AI 찰떡 캐릭터"
            width={80}
            height={80}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            priority
            />
        </div>
      </div>

      {/* 단계별 모달 */}
      <OnboardingModal open={activeStep === 1} onClose={close} title="기초세팅 (채팅)">
        <div className="px-4 pt-3">
          <p className="text-[13px] text-gray-500">
            입력한 내용으로 자기소개서/이력서/프로젝트 초안을 자동으로 채워드려요.
          </p>
        </div>
        <div className="p-4">
          <div className="h-[500px]">
            <OnboardingChat
              onFinished={() => {
                markDone(1);
                close();
              }}
            />
          </div>
        </div>
      </OnboardingModal>

      <OnboardingModal open={activeStep === 2} onClose={close} title="AI 사용법 (준비 중)">
        <div className="p-4">
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
            곧 제공됩니다. 에디터에서 AI를 잘 쓰는 방법과 프롬프트 모음이 들어올 예정이에요.
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => { markDone(2); close(); }}
              className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-black"
            >
              임시로 완료 처리
            </button>
          </div>
        </div>
      </OnboardingModal>

      <OnboardingModal open={activeStep === 3} onClose={close} title="점수 측정 (준비 중)">
        <div className="p-4">
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
            곧 제공됩니다. 문서 품질 점수와 개선 포인트를 확인할 수 있어요.
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => { markDone(3); close(); }}
              className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-black"
            >
              임시로 완료 처리
            </button>
          </div>
        </div>
      </OnboardingModal>
    </>
  );
}
