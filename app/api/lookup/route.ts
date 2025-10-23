import { NextResponse } from "next/server";
import companies from "@/data/companies.json";
import roles from "@/data/roles.json";

type TType = "company" | "role";

/* ---------- 문자열 정규화 ---------- */
function norm(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

/* ---------- 간단한 스코어링 함수 ---------- */
function score(item: string, q: string) {
  const ni = norm(item);
  const nq = norm(q);

  if (!nq) return 0;
  if (ni.startsWith(nq)) return 1000 - Math.abs(ni.length - nq.length) * 2;
  const idx = ni.indexOf(nq);
  if (idx >= 0) return 500 - idx * 5 - Math.abs(ni.length - nq.length);
  return -9999;
}

/* ---------- GET: 자동완성 및 최근검색 병합 ---------- */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") || "") as TType;
  const q = (searchParams.get("q") || "").trim();
  const recentRaw = searchParams.get("recent") || "";

  const source =
    type === "company"
      ? (companies as string[])
      : type === "role"
      ? (roles as string[])
      : null;

  if (!source) {
    return NextResponse.json({ results: [] });
  }

  /* ---------- 최근검색 리스트 파싱 ---------- */
  const recentList = recentRaw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 5);

  let results: string[] = [];

  /* ---------- 검색어가 없을 때 ---------- */
  if (!q) {
    const popular = source.slice(0, 15);
    results = [
      ...recentList.map((r) => `🔁 ${r}`),
      ...popular.filter((p) => !recentList.includes(p)),
    ];
  } else {
    /* ---------- 검색어 있을 때 ---------- */
    const scored = source
      .map((item) => ({ item, s: score(item, q) }))
      .filter(({ s }) => s > -9999)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map(({ item }) => item);

    results = [
      ...recentList
        .filter((r) => norm(r).includes(norm(q)))
        .map((r) => `🔁 ${r}`),
      ...scored,
    ];
  }

  return NextResponse.json({ results });
}
