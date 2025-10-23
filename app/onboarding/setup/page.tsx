"use client";
import { useRouter } from "next/navigation";
import { markOnboardingStepDone } from "@/components/OnboardingBanner";

export default function SetupPage() {
  const router = useRouter();

  const handleFinish = () => {
    // 여기서 샘플 폴더/문서 만드는 로직 나중에 넣을거야
    markOnboardingStepDone("setup");
    router.push("/onboarding/ai");
  };

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">빠른 기초 세팅</h1>
      <p className="text-sm text-gray-600 mt-2">스펙클라우드 기본 폴더와 템플릿을 세팅합니다.</p>

      <button
        onClick={handleFinish}
        className="mt-6 rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        세팅 완료
      </button>
    </div>
  );
}
