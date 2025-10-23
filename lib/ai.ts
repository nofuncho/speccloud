// lib/ai.ts
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.AI_MODEL || "gpt-4o-mini";

const client = apiKey ? new OpenAI({ apiKey }) : null;

function toArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function aiDraftResume(profile: any, projects: any[]): Promise<string | null> {
  if (!client) return null;
  const interests = toArray(profile?.interests).join(", ");
  const skills = toArray(profile?.skills).join(", ");
  const projBrief = projects.slice(0, 5).map((p) => ({
    name: p.name,
    role: p.role,
    period: [p.startDate?.toISOString()?.slice(0,7), p.endDate?.toISOString()?.slice(0,7)].filter(Boolean).join(" ~ "),
    problem: p.problem,
    action: p.action,
    result: p.result,
    techStack: toArray(p.techStack).join(", "),
  }));

  const sys = `너는 한국어 이력서/경력기술서 초안 작성 도우미야.
- 문어체, 간결한 불릿/섹션 구조.
- 회사/역할/기간/성과(수치) 중심.
- 과장/허위 금지, 입력이 없으면 생략.`;
  const usr = {
    task: "이력서 본문 초안 작성 (텍스트, 마크다운 허용)",
    profile: {
      name: profile?.name, email: profile?.email, phone: profile?.phone,
      school: profile?.school, major: profile?.major, graduationY: profile?.graduationY,
      currentCompany: profile?.currentCompany, currentRole: profile?.currentRole, totalYears: profile?.totalYears,
      interests, skills,
    },
    projects: projBrief,
    format: `제목 없이 본문만. 섹션 예시:
[요약]
- 연차/역할/핵심역량

[학력]
- 학교 / 전공 / 졸업연도

[보유 기술]
- 기술, 도구

[경력]
- 회사 / 역할 (기간)
  - 성과 1 (수치)
  - 성과 2 (수치)

[프로젝트] (선택)
- 프로젝트명 (기간, 역할, 기술)
  - 문제/행동/성과 요약`,
  };

  const res = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(usr) },
    ],
  });
  return res.choices[0]?.message?.content ?? null;
}

export async function aiDraftCoverLetter(profile: any): Promise<string | null> {
  if (!client) return null;
  const interests = toArray(profile?.interests).join(", ");
  const skills = toArray(profile?.skills).join(", ");
  const sys = `너는 한국어 자기소개서 초안 작성 도우미야.
- 3~4개 섹션(동기/역량/경험/포부), 800~1200자.
- 과장 금지, 입력 없으면 생략. 간결하고 구체적.`;
  const usr = {
    task: "자기소개서 초안 작성",
    profile: {
      name: profile?.name,
      school: profile?.school, major: profile?.major, graduationY: profile?.graduationY,
      currentRole: profile?.currentRole, totalYears: profile?.totalYears,
      interests, skills,
    },
    format: `[지원동기]
(관심 분야 연결)

[핵심역량]
(스킬/도구/방법론)

[경험/사례]
(STAR 1~2개, 수치 강조)

[포부]
(기여 포인트, 성장 계획)`,
  };

  const res = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(usr) },
    ],
  });
  return res.choices[0]?.message?.content ?? null;
}
