import { NextResponse } from "next/server";

// 서버환경변수
const PROXY_TOKEN = process.env.NEWS_API_KEY || "";
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";

// 네이버 뉴스 검색 API
// 문서: https://developers.naver.com/docs/serviceapi/search/news/news.md
const NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json";

// 네이버 응답은 title/description에 <b>태그 등 포함 → 제거
function stripTags(s: string) {
  return s?.replace(/<[^>]+>/g, "") ?? "";
}
function hostFromUrl(u?: string) {
  try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const count = Math.min(Math.max(Number(searchParams.get("count") || 5), 1), 20); // 1~20
  const sort = "date"; // 날짜 최신순(date) or 정확도(sim)

  // 1) 간단 인증 (companyBrief.ts가 Bearer로 보냄)
  const auth = req.headers.get("authorization") || "";
  if (PROXY_TOKEN && auth !== `Bearer ${PROXY_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return NextResponse.json({ error: "naver_keys_missing" }, { status: 500 });
  }

  try {
    // 2) 네이버 API 호출
    const url = `${NAVER_NEWS_URL}?query=${encodeURIComponent(q)}&display=${count}&sort=${sort}`;
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
      },
      // 캐싱을 얕게 주고 싶으면: next: { revalidate: 10800 }
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "provider_error", detail: text }, { status: 502 });
    }

    const data = await res.json();
    const items = (data?.items || []) as any[];

    // 3) companyBrief.ts의 fetchCompanyNews()가 이해하는 포맷으로 정규화
    //    -> { articles: [{ title, url, source: {name}, publishedAt }] }
    const articles = items.map((it) => {
      const title = stripTags(it.title || "");
      const url = it.originallink || it.link || "";
      const publishedAt = it.pubDate; // 예: "Tue, 22 Oct 2024 10:00:00 +0900"
      const source = hostFromUrl(url) || "Naver News";
      return {
        title,
        url,
        source: { name: source },
        publishedAt,
      };
    });

    return NextResponse.json({ articles });
  } catch (e: any) {
    return NextResponse.json({ error: "proxy_error", detail: e?.message }, { status: 500 });
  }
}
