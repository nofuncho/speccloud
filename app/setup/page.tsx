// app/setup/page.tsx  (Server Component, 중앙 Pane 영역에 들어오도록 레이아웃과 동일 컨테이너 사용)
import OnboardingChat from "@/app/onboarding/ai/page";

export default function SetupPage() {
  return (
    <div className="h-full">
      <OnboardingChat />
    </div>
  );
}
