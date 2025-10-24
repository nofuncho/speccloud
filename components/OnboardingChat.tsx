// components/OnboardingChat.tsx
"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { saveOnboardingAndInitialize } from "@/app/actions/onboardingActions";

type QA = { role: "system" | "user"; text: string };
type StepKey =
  | "name" | "email" | "phone"
  | "school" | "major" | "graduationY" | "gpaBlock"
  | "interests" | "skills"
  | "isExperienced"
  | "totalYears" | "currentCompany" | "currentRole"
  | "projectsLoopStart" | "project_name" | "project_period" | "project_role"
  | "project_problem" | "project_action" | "project_result" | "project_tech"
  | "addMoreProject" | "finish";

export default function OnboardingChat({ onFinished }: { onFinished?: () => void }) {
  // 시작 안내는 채팅으로만 표시
  const [messages, setMessages] = useState<QA[]>([
    { role: "system", text: "어서 와요! 스펙클라우드 기초세팅을 시작할게요." },
    { role: "system", text: "입력한 내용으로 자기소개서/이력서/프로젝트 초안을 자동으로 채워드려요. Enter 전송, Shift+Enter 줄바꿈 :)" },
  ]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<StepKey>("name");

  const dataRef = useRef<{ profile:any; projects:any[]; currentProject:any }>({
    profile: {}, projects: [], currentProject: {},
  });

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);
  useEffect(() => { scrollToBottom(true); }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const el = scrollBoxRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setShowScrollDown(!nearBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const prompts = useMemo<Record<StepKey, string>>(
    () => ({
      name: "이름을 알려주세요.",
      email: "이메일 주소는요?",
      phone: "연락처(하이픈 없이) 알려주세요. (건너뛰기 가능)",
      school: "학교명은요? (건너뛰기 가능)",
      major: "전공은요? (건너뛰기 가능)",
      graduationY: "졸업연도(예: 2023, 건너뛰기 가능)",
      gpaBlock: "학점(예: 3.8/4.5 형태, 건너뛰기 가능)",
      interests: "관심 직무/산업 키워드를 3~5개 적어주세요. (쉼표로 구분)",
      skills: "보유 스킬을 적어주세요. (쉼표로 구분)",
      isExperienced: "경력자이신가요? (예/아니오)",
      totalYears: "총 경력 연차는 몇 년인가요? (예: 3.5)",
      currentCompany: "현재(또는 최근) 회사명은요?",
      currentRole: "현재(또는 최근) 직무는요?",
      projectsLoopStart: "주요 프로젝트를 입력할게요. 최소 1개는 권장돼요!",
      project_name: "프로젝트명을 알려주세요.",
      project_period: "프로젝트 기간을 알려주세요. (예: 2023.01~2023.08)",
      project_role: "역할은 무엇이었나요?",
      project_problem: "문제/과제는 무엇이었나요? (Problem)",
      project_action: "어떤 행동/해결을 했나요? (Action)",
      project_result: "어떤 성과가 있었나요? 가능하면 수치로! (Result)",
      project_tech: "사용 기술 스택을 쉼표로 입력해주세요.",
      addMoreProject: "다른 프로젝트도 추가할까요? (예/아니오)",
      finish: "입력 감사합니다. 초안을 생성할게요!",
    }),
    []
  );

  const placeholders = useMemo<Record<StepKey, string>>(
    () => ({
      name: "홍길동",
      email: "you@example.com",
      phone: "01012345678",
      school: "00대학교",
      major: "컴퓨터공학",
      graduationY: "2024",
      gpaBlock: "3.9/4.5",
      interests: "프론트엔드, 커머스, 데이터",
      skills: "TypeScript, React, SQL",
      isExperienced: "예 / 아니오",
      totalYears: "3.0",
      currentCompany: "스펙클라우드",
      currentRole: "프론트엔드 개발자",
      projectsLoopStart: "",
      project_name: "이력서 관리 웹앱",
      project_period: "2024.03~2024.12",
      project_role: "FE 개발/리드",
      project_problem: "복잡한 문서관리/버전관리 문제",
      project_action: "폴더 트리, 템플릿, 자동저장 구현",
      project_result: "작성 시간 40% 단축, 유지율 20%↑",
      project_tech: "Next.js, Prisma, MySQL, Tailwind",
      addMoreProject: "예 / 아니오",
      finish: "",
    }),
    []
  );

  const next = (s: StepKey): StepKey => {
    switch (s) {
      case "name": return "email";
      case "email": return "phone";
      case "phone": return "school";
      case "school": return "major";
      case "major": return "graduationY";
      case "graduationY": return "gpaBlock";
      case "gpaBlock": return "interests";
      case "interests": return "skills";
      case "skills": return "isExperienced";
      case "isExperienced": return (dataRef.current.profile.isExperienced ? "totalYears" : "finish");
      case "totalYears": return "currentCompany";
      case "currentCompany": return "currentRole";
      case "currentRole": return "projectsLoopStart";
      case "projectsLoopStart": return "project_name";
      case "project_name": return "project_period";
      case "project_period": return "project_role";
      case "project_role": return "project_problem";
      case "project_problem": return "project_action";
      case "project_action": return "project_result";
      case "project_result": return "project_tech";
      case "project_tech": return "addMoreProject";
      case "addMoreProject": return "finish";
      default: return "finish";
    }
  };

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role === "user") {
      setMessages(prev => [...prev, { role: "system", text: prompts[step] }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const saveField = (k: StepKey, raw: string) => {
    const val = raw.trim();
    const p = dataRef.current.profile as any;
    const cp = dataRef.current.currentProject as any;

    if (k === "name") p.name = val;
    if (k === "email") p.email = val;
    if (k === "phone") p.phone = val || null;
    if (k === "school") p.school = val || null;
    if (k === "major") p.major = val || null;
    if (k === "graduationY") p.graduationY = val ? Number(val) : null;
    if (k === "gpaBlock") {
      if (val.includes("/")) {
        const [g, m] = val.split("/").map(s => s.trim());
        p.gpa = g ? Number(g) : null;
        p.gpaMax = m ? Number(m) : null;
      }
    }
    if (k === "interests") p.interests = val ? val.split(",").map((s: string) => s.trim()) : [];
    if (k === "skills") p.skills = val ? val.split(",").map((s: string) => s.trim()) : [];
    if (k === "isExperienced") p.isExperienced = /^(예|네|y|yes)$/i.test(val);
    if (k === "totalYears") p.totalYears = val ? Number(val) : null;
    if (k === "currentCompany") p.currentCompany = val || null;
    if (k === "currentRole") p.currentRole = val || null;

    if (k === "project_name") cp.name = val;
    if (k === "project_period") cp.period = val;
    if (k === "project_role") cp.role = val;
    if (k === "project_problem") cp.problem = val;
    if (k === "project_action") cp.action = val;
    if (k === "project_result") cp.result = val;
    if (k === "project_tech") cp.techStack = val ? val.split(",").map((s: string) => s.trim()) : [];

    if (k === "addMoreProject") {
      if (cp.name) {
        dataRef.current.projects.push({ ...cp });
        dataRef.current.currentProject = {};
      }
      return /^(예|네|y|yes)$/i.test(val) ? "project_name" : "finish";
    }
    return null;
  };

  const submitValue = async (raw: string) => {
    const v = raw.trim();
    setMessages(prev => [...prev, { role: "user", text: v || "(건너뜀)" }]);

    const maybeNext = saveField(step, v);
    const nextStep = (maybeNext ?? next(step)) as StepKey;
    setStep(nextStep);

    if (nextStep === "finish") {
      setMessages(prev => [...prev, { role: "system", text: prompts["finish"] }]);
      try {
        await saveOnboardingAndInitialize({
          profile: dataRef.current.profile,
          projects: dataRef.current.projects,
        });
        setMessages(prev => [...prev, { role: "system", text: "초안 생성 완료! 좌측 폴더에서 문서를 확인해보세요." }]);
        onFinished?.();
      } catch (err:any) {
        setMessages(prev => [...prev, { role: "system", text: `오류가 발생했어요: ${err?.message || "저장 실패"}` }]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = input;
    setInput("");
    await submitValue(v);
  };

  // 입력창 자동 리사이즈
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const autoGrow = useCallback(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);
  useEffect(() => { autoGrow(); }, [input, autoGrow]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim()) return;
      void handleSubmit(e as any);
    }
  };

  // 빠른답변(칩)
  const quickChips = useMemo(() => {
    const chips: string[] = [];
    if (["phone","school","major","graduationY","gpaBlock"].includes(step)) chips.push("건너뛰기");
    if (step === "isExperienced" || step === "addMoreProject") chips.push("예", "아니오");
    return chips;
  }, [step]);

  /* =========================
     ✅ 모바일 채팅창 프레임로 변경
  ========================== */
  return (
    <div className="h-full flex items-center justify-center bg-transparent">
      <div
        className="
          relative flex flex-col
          w-[380px] max-w-[90vw] h-[600px] max-h-[80vh]
          bg-[#F9FAFB] rounded-[24px] shadow-lg border border-gray-200 overflow-hidden
        "
      >
        {/* 메시지 영역 */}
        <div ref={scrollBoxRef} className="relative flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-3">
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 스크롤다운 버튼 */}
          {showScrollDown && (
            <button
              onClick={() => scrollToBottom(true)}
              className="absolute right-4 bottom-24 rounded-full border bg-white/90 backdrop-blur px-3 py-1 text-xs shadow hover:shadow-md"
              aria-label="맨 아래로"
            >
              ↓ 새 메시지
            </button>
          )}
        </div>

        {/* 빠른답변 칩 */}
        {quickChips.length > 0 && (
          <div className="px-4 pb-1 bg-[#F9FAFB]">
            <div className="flex flex-wrap gap-2">
              {quickChips.map((c, idx) => (
                <button
                  key={idx}
                  onClick={() => submitValue(c)}
                  className="rounded-full border border-gray-300 bg-white hover:bg-gray-100 px-3 py-1 text-xs transition"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 입력창 */}
        {step !== "finish" && (
          <form onSubmit={handleSubmit} className="p-3 border-t bg-white">
            <div className="flex items-end gap-2 rounded-full border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-sky-400 transition">
              <textarea
                ref={taRef}
                className="min-h-[36px] max-h-40 w-full resize-none outline-none text-sm leading-6 placeholder:text-gray-400"
                placeholder={placeholders[step] || "메시지를 입력하세요..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={autoGrow}
                onKeyDown={onKeyDown}
                rows={1}
                autoFocus
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-sky-500 text-white text-sm font-semibold px-4 py-2 hover:bg-sky-600 disabled:opacity-50 transition"
                disabled={!input.trim()}
              >
                전송
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* --- 말풍선 --- */
function ChatBubble({ role, text }: { role: "system" | "user"; text: string }) {
  const isSystem = role === "system";
  return (
    <div className={`flex items-end gap-2 ${isSystem ? "justify-start" : "justify-end"}`}>
      {isSystem && (
        <div className="h-7 w-7 rounded-full overflow-hidden bg-white border shadow-sm">
          <Image src="/onboarding/character.png" alt="AI" width={28} height={28} />
        </div>
      )}
      <div
        className={[
          "max-w-[80%] sm:max-w-[70%] px-4 py-2 text-sm leading-6 shadow-sm",
          "rounded-2xl",
          isSystem ? "bg-white border text-gray-800 rounded-bl-md" : "bg-sky-500 text-white rounded-br-md",
        ].join(" ")}
      >
        {text}
      </div>
      {!isSystem && (
        <div className="h-7 w-7 rounded-full bg-sky-500 text-white text-[11px] grid place-items-center">
          나
        </div>
      )}
    </div>
  );
}
