// components/SidebarOnboardingCard.tsx
"use client";

import OnboardingBanner from "./OnboardingBanner";

export default function SidebarOnboardingCard() {
  // 바깥 카드 스타일 제거: border/rounded/shadow/padding 모두 X
  return (
    <div className="mt-2">
      <OnboardingBanner />
    </div>
  );
}
