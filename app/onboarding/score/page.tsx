"use client";
import { useRouter } from "next/navigation";
import { markOnboardingStepDone } from "@/components/OnboardingBanner";

export default function ScorePage() {
  const router = useRouter();

  const handleFinish = () => {
    // TODO: 점수 계산/저장 완료 처리
    markOnboardingStepDone("score");
    router.push("/"); // 홈으로 이동 (원하면 다른 곳으로)
  };

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">스펙 점수 측정</h1>
      {/* 점수 카드/그래프 UI */}
      <button className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-white" onClick={handleFinish}>
        측정 완료
      </button>
    </div>
  );
}
