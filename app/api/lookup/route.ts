import { NextResponse } from "next/server";

/** ✅ 한국 회사/직무 시드 — 첫 배포용(필요 시 확장/교체) */
const COMPANY_SEED = [
  "삼성전자","SK하이닉스","현대자동차","기아","LG전자","LG화학","포스코","NAVER","카카오","두산","롯데케미칼","KT","SK텔레콤",
  "한화","한화솔루션","CJ제일제당","현대모비스","현대중공업","현대오일뱅크","HD현대중공업","현대제철","GS칼텍스","S-OIL",
  "신세계","대한항공","아시아나항공","HMM","한진","쿠팡","배달의민족","토스","당근마켓","라인플러스","넥슨","넷마블","엔씨소프트",
  "카카오뱅크","케이뱅크","신한은행","국민은행","우리은행","하나은행","NH농협은행","IBK기업은행",
  "SK에너지","SK이노베이션","SK실트론","SK쉴더스","LG디스플레이","LG이노텍","LX세미콘",
  "현대건설","GS건설","DL이앤씨","대우건설","포스코이앤씨",
  "한국전력","한국가스공사","한국수력원자력","인천국제공항공사","서울교통공사",
  "카카오엔터프라이즈","네이버클라우드","삼성SDS","LG CNS","롯데정보통신"
];

const ROLE_SEED = [
  "백엔드 엔지니어","프론트엔드 엔지니어","풀스택 엔지니어","안드로이드 개발자","iOS 개발자","데이터 엔지니어",
  "데이터 분석가","데이터 사이언티스트","ML 엔지니어","MLOps 엔지니어","DevOps 엔지니어","Site Reliability Engineer",
  "인프라 엔지니어","보안 엔지니어","QA 엔지니어","테스트 자동화","게임 클라이언트","게임 서버",
  "프로덕트 매니저(PM)","프로덕트 오너(PO)","UI/UX 디자이너","BX/브랜딩 디자이너","모션 디자이너",
  "마케터","그로스 마케터","콘텐츠 마케터","세일즈","Biz Dev","HR","리크루터","재무","회계",
  "기획","서비스 기획","전략기획","운영 매니저","CS 매니저"
];

/** 간단 정규화: 공백/하이픈 제거, 소문자화 */
function norm(s: string) {
  return s.toLowerCase().replace(/\s|-/g, "");
}

/** 초간단 초성 일치(한글 초성만 추출 후 포함 여부) */
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function toCho(str: string) {
  let res = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) res += CHO[Math.floor(code / 588)];
    else res += ch;
  }
  return res;
}

function searchPool(pool: string[], q: string) {
  if (!q) return pool.slice(0, 10);
  const nq = norm(q);
  const cq = toCho(q);
  return pool
    .map((name) => ({ name, n: norm(name), c: toCho(name) }))
    .filter(({ n, c }) => n.includes(nq) || c.includes(cq))
    .slice(0, 10)
    .map(({ name }) => name);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "company" | "role"
  const q = searchParams.get("q") || "";

  const pool = type === "role" ? ROLE_SEED : COMPANY_SEED;
  const results = searchPool(pool, q);

  return NextResponse.json({ results });
}
