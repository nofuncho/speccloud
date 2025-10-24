"use server";

import OpenAI from "openai";

/** =========================
 *  AI 기본 설정
 *  ========================= */
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

if (!API_KEY) {
  throw new Error(
    "[aiActions] OPENAI_API_KEY 가 설정되어 있지 않습니다. .env.local 에 키를 추가하세요."
  );
}

const client = new OpenAI({ apiKey: API_KEY });

/** =========================
 *  타입 정의
 *  ========================= */
export type AiMode =
  | "proofread"     // 맞춤법/문법/가독성
  | "rewrite_tone"  // 톤 변경
  | "summarize"     // 요약
  | "keywords"      // 키워드 추출
  | "translate_en"  // 한국어 -> 영어
  | "translate_ko"; // 영어 -> 한국어

export type UserProfile = {
  years?: number;
  roles?: string[];
  industries?: string[];
  skills?: string[];
  tone?: string; // 예: "차분하고 전문적", "자신감 있고 간결"
  style?: {
    preferNumbers?: boolean;
    sentenceMax?: number; // 문장 최대 길이(단어 수 기준 가이드)
    bannedWords?: string[];
  };
};

/** =========================
 *  시스템 프롬프트 빌더
 *  ========================= */
function buildSystem(profile?: UserProfile) {
  const lines: string[] = [
    "You are a meticulous Korean resume/cover-letter editor.",
    "- Keep the original meaning; avoid exaggeration.",
    "- Prefer clear, concise, professional Korean unless translation to English is requested.",
  ];

  if (profile?.tone) lines.push(`- Preferred tone: ${profile.tone}`);
  if (profile?.style?.preferNumbers) lines.push("- Emphasize measurable outcomes and numbers.");
  if (profile?.style?.sentenceMax)
    lines.push(`- Keep sentences roughly under ${profile.style.sentenceMax} words.`);
  if (profile?.skills?.length) lines.push(`- Candidate skills: ${profile.skills.join(", ")}`);
  if (profile?.style?.bannedWords?.length)
    lines.push(`- Avoid these words: ${profile.style.bannedWords.join(", ")}`);

  return lines.join("\n");
}

/** =========================
 *  유틸: 사용자 요청 프롬프트 생성
 *  ========================= */
function buildUserPrompt(op: AiMode, text: string, extra?: { tone?: string }) {
  switch (op) {
    case "proofread":
      return `다음 한국어 텍스트를 맞춤법/문법/가독성 중심으로 자연스럽게 다듬어줘. 의미는 유지하고 불필요한 과장은 금지.\n\n${text}`;
    case "rewrite_tone":
      return `다음을 "${extra?.tone ?? "차분하고 전문적"}" 톤으로 재작성해줘. 분량은 비슷하게 유지:\n\n${text}`;
    case "summarize":
      return `다음을 2~3문장으로 요약하고, 핵심 bullet 3개를 함께 제시해줘:\n\n${text}`;
    case "keywords":
      return `다음 텍스트에서 핵심 키워드(스킬/성과/지표)를 bullet로만 추출해줘:\n\n${text}`;
    case "translate_en":
      return `다음을 자연스러운 비즈니스 영어로 번역해줘:\n\n${text}`;
    case "translate_ko":
      return `다음을 자연스러운 비즈니스 한국어로 번역해줘:\n\n${text}`;
    default:
      return text;
  }
}

/** =========================
 *  메인 서버액션
 *  =========================
 *  @param op     : 작업 모드
 *  @param text   : 원문(선택 영역 텍스트 등)
 *  @param extra  : 톤 등 추가 옵션
 *  @param profile: 온보딩 등 사용자 프로필(선택)
 *  @returns 가공된 텍스트(plain string)
 */
export async function runAi(
  op: AiMode,
  text: string,
  extra?: { tone?: string },
  profile?: UserProfile
): Promise<string> {
  const input = (text ?? "").trim();
  if (!input) return "";

  // 시스템 프롬프트
  const system = buildSystem(profile);

  // 사용자 요청 프롬프트
  const userPrompt = buildUserPrompt(op, input, extra);

  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    const out = res.choices?.[0]?.message?.content ?? "";
    // 에디터 삽입 시 깔끔하게 쓰도록 사소한 정리
    return out.replace(/^\s+|\s+$/g, "");
  } catch (err: unknown) {
    console.error("[runAi] OpenAI error:", err);
    // 클라이언트에 노출되는 메시지는 안전하게
    throw new Error("AI 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}

/** =========================
 *  (선택) 편의 래퍼
 *  =========================
 *  각 모드를 손쉽게 쓰고 싶다면 아래처럼 래퍼를 사용하세요.
 */
export async function aiProofread(text: string, profile?: UserProfile) {
  return runAi("proofread", text, undefined, profile);
}
export async function aiRewriteTone(text: string, tone = "차분하고 전문적", profile?: UserProfile) {
  return runAi("rewrite_tone", text, { tone }, profile);
}
export async function aiSummarize(text: string, profile?: UserProfile) {
  return runAi("summarize", text, undefined, profile);
}
export async function aiKeywords(text: string, profile?: UserProfile) {
  return runAi("keywords", text, undefined, profile);
}
export async function aiKoToEn(text: string, profile?: UserProfile) {
  return runAi("translate_en", text, undefined, profile);
}
export async function aiEnToKo(text: string, profile?: UserProfile) {
  return runAi("translate_ko", text, undefined, profile);
}
