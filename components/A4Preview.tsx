"use client";

import React, { useEffect, useRef, useState } from "react";

/** 96dpi 기준 mm → px */
const mmToPx = (mm: number) => (mm * 96) / 25.4;

// A4 규격 (210 x 297mm)
const A4_W = mmToPx(210); // ≈ 794px
const A4_H = mmToPx(297); // ≈ 1123px

type A4PreviewProps = {
  html: string;
  padding?: number;   // 페이지 안쪽 여백(px)
  autoScale?: boolean;
  zoom?: number;
  showToolbar?: boolean;
};

export default function A4Preview({
  html,
  padding = 48,
  autoScale = true,
  zoom = 1,
  showToolbar = true,
}: A4PreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(zoom);

  // 화면 폭에 맞춰 자동 스케일 (최소 0.5 보장)
  useEffect(() => {
    if (!hostRef.current) return;
    if (!autoScale) { setScale(zoom); return; }
    const host = hostRef.current;

    const resize = () => {
      const cw = host.clientWidth;
      if (!cw || cw <= 0) { setScale((s) => (s || 0.8)); return; }
      const available = cw - 16;
      const raw = available / A4_W;
      setScale(Math.max(0.5, Math.min(1, raw)));
    };

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(host);
    const t = setTimeout(resize, 0);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, [autoScale, zoom]);

  // HTML → 페이지 분할
  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;

    // 초기화
    host.innerHTML = "";
    pagesRef.current = [];

    // 측정용 스크래치 컨테이너
    const scratch = document.createElement("div");
    scratch.style.position = "absolute";
    scratch.style.visibility = "hidden";
    scratch.style.pointerEvents = "none";
    scratch.style.left = "-99999px";
    scratch.style.top = "0";
    scratch.style.width = `${A4_W - padding * 2}px`;
    scratch.innerHTML = sanitizeHtml(html || "");

    // 루트 텍스트만 있을 땐 <p>로 감싸기
    const onlyText =
      scratch.childNodes.length > 0 &&
      Array.from(scratch.childNodes).every(
        (n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === "BR")
      );
    if (onlyText) {
      const p = document.createElement("p");
      p.textContent = scratch.textContent || "";
      scratch.innerHTML = "";
      scratch.appendChild(p);
    }

    document.body.appendChild(scratch);

    // A4 페이지 생성기
    const createPage = () => {
      // 바깥 페이지 프레임
      const page = document.createElement("div");
      page.className = "relative bg-white shadow-xl rounded-none border border-gray-200 mx-auto my-4";
      page.style.width = `${A4_W}px`;
      page.style.height = `${A4_H}px`;
      page.style.transformOrigin = "top left";
      page.style.overflow = "hidden";

      // 실제 컨텐츠 박스 (box-sizing: border-box, padding 포함)
      const inner = document.createElement("div");
      inner.style.boxSizing = "border-box";
      inner.style.padding = `${padding}px`;
      inner.style.width = `${A4_W}px`;     // padding 포함 총 너비
      // ⚠️ minHeight/height 지정하지 않음! 실제 콘텐츠 높이로 판단
      inner.style.margin = "0 auto";

      // 타이포 기본값
      inner.style.fontFamily =
        `Inter, Pretendard, "Noto Sans KR", system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans", sans-serif`;
      inner.style.lineHeight = "1.7";
      inner.style.color = "#111827";
      inner.style.fontSize = "14px";

      page.appendChild(inner);
      host.appendChild(page);
      pagesRef.current.push(page);
      return { page, inner };
    };

    const { inner: firstInner } = createPage();
    let currentInner = firstInner;

    const nodes = Array.from(scratch.childNodes);
    for (const node of nodes) {
      let clone: Node = node.cloneNode(true);

      // 텍스트 노드는 단락으로 감싸서 추가
      if (clone.nodeType === Node.TEXT_NODE) {
        const p = document.createElement("p");
        p.textContent = clone.textContent || "";
        clone = p;
      }

      currentInner.appendChild(clone);

      // 강제 page-break(before)
      if ((clone as any).__pageBreakBefore) {
        currentInner.removeChild(clone);
        const { inner: ni } = createPage();
        currentInner = ni;
        currentInner.appendChild(clone);
      }

      // 높이 초과 검사
      // scrollHeight에는 padding이 포함되므로, 비교 기준도 패딩 포함 A4 전체 높이로 잡는다.
      const contentH = currentInner.scrollHeight; // padding 포함
      const maxH = A4_H;                          // padding 포함 기준
      if (contentH > maxH) {
        // 방금 추가한 블록을 다음 페이지로 이동
        currentInner.removeChild(clone);
        const { inner: ni } = createPage();
        currentInner = ni;
        currentInner.appendChild(clone);
      }

      // 강제 page-break(after)
      if ((clone as any).__pageBreakAfter) {
        const { inner: ni2 } = createPage();
        currentInner = ni2;
      }
    }

    setPageCount(pagesRef.current.length);

    // 이미지 로딩 후(크기 확정)도 한 번 더 레이아웃 안정화
    const imgs = scratch.querySelectorAll("img");
    let pending = imgs.length;
    const cleanup = () => { try { scratch.remove(); } catch {} };
    if (pending > 0) {
      imgs.forEach((img) => {
        const done = () => { if (--pending === 0) cleanup(); };
        if (img.complete) done();
        else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
      });
    } else {
      cleanup();
    }

    return cleanup;
  }, [html, padding]);

  // 스케일 적용
  useEffect(() => {
    pagesRef.current.forEach((page) => {
      page.style.transform = `scale(${scale})`;
      page.style.marginBottom = `${Math.max(16, 24 * scale)}px`;
    });
  }, [scale, pageCount]);

  const zoomPct = Math.round(scale * 100);

  return (
    <div className="h-full w-full overflow-auto bg-gray-50">
      {showToolbar && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-white/80 backdrop-blur border-b border-gray-200">
          <div className="text-sm text-gray-700">A4 미리보기 • {pageCount}페이지</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))} className="px-2 py-1 border rounded text-sm">-</button>
            <span className="w-14 text-center text-sm tabular-nums">{zoomPct}%</span>
            <button onClick={() => setScale((s) => Math.min(2, Math.round((s + 0.1) * 10) / 10))} className="px-2 py-1 border rounded text-sm">+</button>
            <button onClick={() => setScale(1)} className="ml-2 px-2 py-1 border rounded text-sm">100%</button>
            <button onClick={() => setScale(0.8)} className="px-2 py-1 border rounded text-sm">80%</button>
            <button onClick={() => setScale(0.6)} className="px-2 py-1 border rounded text-sm">60%</button>
          </div>
        </div>
      )}
      <div ref={hostRef} className="px-4 py-6" />
    </div>
  );
}

/** 간단 sanitize */
function sanitizeHtml(raw: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = raw ?? "";
  tmp.querySelectorAll("script, style").forEach((el) => el.remove());
  tmp.querySelectorAll<HTMLElement>("img, table").forEach((el) => {
    el.style.maxWidth = "100%";
    el.style.height = "auto";
  });
  tmp.querySelectorAll<HTMLElement>("[data-page-break]").forEach((el) => {
    const v = el.getAttribute("data-page-break");
    if (v === "before") (el as any).__pageBreakBefore = true;
    if (v === "after") (el as any).__pageBreakAfter = true;
  });
  return tmp.innerHTML;
}
