import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

/** 간단한 HTML → 텍스트 스트리핑 */
function htmlToText(input: string) {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** content(JSON) → plain text */
function contentToText(content: any): string {
  if (!content) return "";
  if (Array.isArray(content.blocks)) {
    const parts = content.blocks.map((b: any) => {
      if (typeof b?.text === "string") return b.text;
      if (typeof b?.html === "string") return htmlToText(b.html);
      if (typeof b === "string") return b;
      return "";
    });
    return parts.filter(Boolean).join("\n\n");
  }
  if (typeof content?.html === "string") return htmlToText(content.html);
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

/** 텍스트를 페이지 폭에 맞춰 줄바꿈 */
function wrapLines(text: string, measure: (t: string) => number, maxWidth: number) {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (measure(test) <= maxWidth) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        if (measure(w) > maxWidth) {
          let buf = "";
          for (const ch of w.split("")) {
            const t = buf + ch;
            if (measure(t) <= maxWidth) buf = t;
            else {
              if (buf) lines.push(buf);
              buf = ch;
            }
          }
          cur = buf;
        } else {
          cur = w;
        }
      }
    }
    lines.push(cur);
  }
  return lines;
}

/** /public/fonts 아래에서 TTF만 로드 (OTF/Variable 전부 배제) */
function loadKoreanTTFFont(): { bytes: Uint8Array | null; pathTried: string[] } {
  const base = path.join(process.cwd(), "public", "fonts");
  const tried: string[] = [];

  // ✨ 우선순위: Pretendard-Regular.ttf → PretendardStd-Regular.ttf → NotoSansKR-Regular.ttf
  const candidates = [
    "Pretendard-Regular.ttf",
    "PretendardStd-Regular.ttf",
    "NotoSansKR-Regular.ttf",
  ].map((n) => path.join(base, n));

  for (const p of candidates) {
    tried.push(p);
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        // 방어: 0바이트 파일 등
        if (buf && buf.byteLength > 0) return { bytes: buf, pathTried: tried };
      }
    } catch {
      // skip
    }
  }
  return { bytes: null, pathTried: tried };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") || "pdf").toLowerCase();

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, title: true, updatedAt: true, content: true },
  });
  if (!doc) return new NextResponse("Not Found", { status: 404 });

  // JSON 다운로드
  if (type === "json") {
    const filename = `${doc.title?.trim() || "document"}_${doc.id.slice(0, 6)}.json`;
    const body = JSON.stringify(
      { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, content: doc.content },
      null,
      2
    );
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ✅ PDF 생성
  const pdfDoc = await PDFDocument.create();
  // fontkit 등록
  pdfDoc.registerFontkit(fontkit);

  // ✅ 폰트: TTF만 로드 (OTF/Variable 배제)
  const { bytes: fontBytes, pathTried } = loadKoreanTTFFont();
  if (!fontBytes) {
    return new NextResponse(
      [
        "TTF 폰트 파일을 찾을 수 없습니다.",
        "아래 경로 중 하나에 파일을 추가해 주세요:",
        ...pathTried.map((p) => ` - ${p}`),
        "",
        "권장: Pretendard-Regular.ttf (또는 NotoSansKR-Regular.ttf)",
        "⚠️ OTF/Variable 폰트는 사용하지 않습니다.",
      ].join("\n"),
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // 커스텀 TTF 임베드
  let font;
  try {
    font = await pdfDoc.embedFont(fontBytes);
  } catch (err: any) {
    return new NextResponse(
      [
        "커스텀 TTF 폰트 임베드 중 오류가 발생했습니다.",
        `오류: ${err?.message || err}`,
        "",
        "점검:",
        "1) 파일이 실제 TTF인지 확인 (OTF/Variable 아님)",
        "2) 손상되지 않은지 확인 (다른 뷰어에서 열어보기)",
        "3) 대안으로 NotoSansKR-Regular.ttf 시도",
      ].join("\n"),
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // A4 사이즈 (pt)
  const A4 = { w: 595.28, h: 841.89 };
  const margin = 56;
  const contentWidth = A4.w - margin * 2;

  let page = pdfDoc.addPage([A4.w, A4.h]);
  let y = A4.h - margin;

  // 제목
  const title = doc.title?.trim() || "제목 없음";
  const titleSize = 18;
  page.drawText(title, {
    x: margin,
    y: (y -= titleSize),
    size: titleSize,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 14;

  // 본문
  const bodyText = contentToText(doc.content);
  const fontSize = 12;
  const lineGap = 6;
  const lineHeight = fontSize + lineGap;

  const lines = wrapLines(bodyText, (t) => font.widthOfTextAtSize(t, fontSize), contentWidth);

  for (const line of lines) {
    if (y - lineHeight < margin) {
      page = pdfDoc.addPage([A4.w, A4.h]);
      y = A4.h - margin;
    }
    page.drawText(line, {
      x: margin,
      y: (y -= lineHeight),
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `${title.replace(/[\\/:*?"<>|]/g, "_") || "document"}_${doc.id.slice(0, 6)}.pdf`;

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
