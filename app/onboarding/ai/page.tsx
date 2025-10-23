// components/OnboardingChat.tsx
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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

export default function OnboardingChat() {
  const [messages, setMessages] = useState<QA[]>([
    { role: "system", text: "안녕하세요! 스펙클라우드 기초세팅을 시작할게요. 엔터로 빠르게 진행됩니다 :)" },
  ]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<StepKey>("name");

  // 누적 답변 저장
  const dataRef = useRef<any>({
    profile: {},
    projects: [] as any[],
    currentProject: {} as any,
  });

  // 질문 사전
  const prompts: Record<StepKey, string> = {
    name: "이름을 알려주세요.",
    email: "이메일 주소는요?",
    phone: "연락처(하이픈 없이) 알려주세요. (건너뛰기: 엔터)",
    school: "학교명은요? (없으면 엔터)",
    major: "전공은요? (없으면 엔터)",
    graduationY: "졸업연도(예: 2023, 없으면 엔터)",
    gpaBlock: "학점(예: 3.8/4.5 형태, 없으면 엔터)",
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
    finish: "입력 감사합니다. 초안을 생성할게요!"
  };

  // 다음 스텝 결정
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
      case "isExperienced":
        return (dataRef.current.profile.isExperienced ? "totalYears" : "finish");
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

  // 현재 질문 출력 제어
  useEffect(() => {
    // 중복 질문 방지: 마지막 메시지가 같은 질문이면 건너뜀
    const last = messages[messages.length - 1];
    if (!last || last.role === "user") {
      setMessages(prev => [...prev, { role: "system", text: prompts[step] }]);
    }
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    setInput("");
    // 사용자의 답변 출력
    setMessages(prev => [...prev, { role: "user", text: v || "(건너뜀)" }]);

    // 저장 로직
    const save = (k: StepKey, vRaw: string) => {
      const v = vRaw.trim();
      const p = dataRef.current.profile;
      const cp = dataRef.current.currentProject;

      if (k === "name") p.name = v;
      if (k === "email") p.email = v;
      if (k === "phone") p.phone = v || null;
      if (k === "school") p.school = v || null;
      if (k === "major") p.major = v || null;
      if (k === "graduationY") p.graduationY = v ? Number(v) : null;
      if (k === "gpaBlock") {
        if (v.includes("/")) {
          const [g, m] = v.split("/").map(s => s.trim());
          p.gpa = g ? Number(g) : null;
          p.gpaMax = m ? Number(m) : null;
        }
      }
      if (k === "interests") p.interests = v ? v.split(",").map(s => s.trim()) : [];
      if (k === "skills") p.skills = v ? v.split(",").map(s => s.trim()) : [];
      if (k === "isExperienced") p.isExperienced = /^예|y|yes/i.test(v);
      if (k === "totalYears") p.totalYears = v ? Number(v) : null;
      if (k === "currentCompany") p.currentCompany = v || null;
      if (k === "currentRole") p.currentRole = v || null;

      if (k === "project_name") cp.name = v;
      if (k === "project_period") cp.period = v; // 파싱은 서버에서
      if (k === "project_role") cp.role = v;
      if (k === "project_problem") cp.problem = v;
      if (k === "project_action") cp.action = v;
      if (k === "project_result") cp.result = v;
      if (k === "project_tech") cp.techStack = v ? v.split(",").map((s: string) => s.trim()) : [];

      if (k === "addMoreProject") {
        // 현재 프로젝트를 push
        if (cp.name) {
          dataRef.current.projects.push({ ...cp });
          dataRef.current.currentProject = {};
        }
        // 예 아니오 분기
        return /^예|y|yes/i.test(v) ? "project_name" : "finish";
      }
      return null;
    };

    // 현재 스텝 저장/전이
    let nextStep = save(step, v) || next(step);
    setStep(nextStep);

    // 종료 처리
    if (nextStep === "finish") {
      setMessages(prev => [...prev, { role: "system", text: prompts["finish"] }]);
      try {
        await saveOnboardingAndInitialize({
          profile: dataRef.current.profile,
          projects: dataRef.current.projects,
        });
        setMessages(prev => [
          ...prev,
          { role: "system", text: "초안 생성 완료! 좌측 폴더에서 문서를 확인해보세요." },
        ]);
      } catch (err: any) {
        setMessages(prev => [
          ...prev,
          { role: "system", text: `오류가 발생했어요: ${err?.message || "저장 실패"}` },
        ]);
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b">
        <h1 className="text-lg font-semibold">기초세팅</h1>
        <p className="text-sm text-gray-500">입력한 내용으로 자기소개서/이력서/프로젝트 초안을 자동으로 채워드려요.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "system" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm leading-6 ${
                m.role === "system" ? "bg-white border" : "bg-sky-500 text-white"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {step !== "finish" && (
        <form onSubmit={handleSubmit} className="p-4 border-t bg-white">
          <input
            className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="여기에 입력 후 Enter"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
        </form>
      )}
    </div>
  );
}
