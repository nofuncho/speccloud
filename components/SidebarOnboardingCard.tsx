"use client";

import { useRouter } from "next/navigation";
import OnboardingBanner from "@/components/OnboardingBanner";

/** 사이드바 상단 온보딩 배너(클라이언트 섬) */
export default function SidebarOnboardingCard({ imageSrc = "/chaltteok.png" }: { imageSrc?: string }) {
  const router = useRouter();
  return (
    <OnboardingBanner
      imageSrc={imageSrc}
      onSetupClick={() => router.push("/onboarding/setup")}
      onAiGuideClick={() => router.push("/onboarding/ai")}
      onScoreClick={() => router.push("/onboarding/score")}
      // doneBanner 를 커스터마이즈하고 싶으면 여기서 넣으면 됨
    />
  );
}
