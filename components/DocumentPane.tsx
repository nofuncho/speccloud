"use client";

import type React from "react";
import { useEffect, useState, useCallback, useRef, useMemo, useTransition } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { renameDocument, saveDocumentJson } from "@/app/actions/folderActions";
import { regenerateDocument } from "@/app/actions/regenerateActions";

/* ✅ 태그 자동완성 + 메타 저장 */
import TagCombobox from "@/components/TagCombobox";
import { updateDocumentMeta } from "@/app/actions/documentMeta";

/* ✅ AI 패널 */
import DocAiPanel from "@/components/DocAiPanel";

/* ---------- A4 미리보기 ---------- */
const A4Preview = dynamic(() => import("@/components/A4Preview"), { ssr: false, loading: () => null });

/* ---------- 타입 ---------- */
type Block = { type: "doc"; html: string } | { type: string; text?: string; html?: string };
type Doc = {
  id: string;
  title: string;
  content: { blocks: Block[] } | null;
  company?: string | null;
  role?: string | null;
};
type SaveState = "idle" | "saving" | "saved" | "error";

/* ---------- 유틸 공통 ---------- */
/** Mac/Win 모두 대응 */
const isCmdOrCtrl = (e: KeyboardEvent | React.KeyboardEvent) => (e.metaKey || e.ctrlKey);

/** 허용 태그만 남기고 붙여넣기 sanitize (간단 버전) */
function sanitizeHtml(html: string): string {
  const ALLOWED = new Set(["P","DIV","H1","H2","UL","OL","LI","BLOCKQUOTE","PRE","CODE","A","IMG","STRONG","EM","U","BR","HR"]);
  const WRAP = document.createElement("div");
  WRAP.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (!ALLOWED.has(el.tagName)) {
        // 허용 안 되면 텍스트만 남김
        const text = document.createTextNode(el.textContent || "");
        el.replaceWith(text);
        return;
      }
      // 위험 속성 제거
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const isAllowedAttr =
          (el.tagName === "A" && (name === "href" || name === "target" || name === "rel")) ||
          (el.tagName === "IMG" && (name === "src" || name === "alt"));
        if (!isAllowedAttr) el.removeAttribute(name);
      });
      // 인라인 스타일 제거
      el.removeAttribute("style");
    }
    // 하위 순회
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      walk(child);
      child = next;
    }
  };
  walk(WRAP);
  return WRAP.innerHTML;
}

/* ---------- 컴포넌트 ---------- */
export default function DocumentPane({ docId }: { docId: string }) {
  /* 상태 */
  const [doc, setDoc] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  /* 저장 상태 */
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState<string>("");

  /* 재생성 상태 */
  const [regenMsg, setRegenMsg] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  /* 에디터/파일 */
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* 내부 ref */
  const isFromEditorRef = useRef(false);
  const lastSavedHtmlRef = useRef<string>("");
  const lastSavedTitleRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* /, ESC — (슬래시 메뉴 UI는 추후 연결하려고 남겨둠) */
  const [slashOpen, setSlashOpen] = useState(false);

  /* 미리보기 모달 */
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentHtml = useMemo(() => blockHtml(blocks), [blocks]);
  const [previewHtmlSnap, setPreviewHtmlSnap] = useState<string>("");

  /* 배너 위치 기준 */
  const writerPaneRef = useRef<HTMLDivElement | null>(null);
  const [bannerCenterX, setBannerCenterX] = useState<number | null>(null);

  useEffect(() => {
    const reposition = () => {
      const r = writerPaneRef.current?.getBoundingClientRect();
      if (!r) return;
      setBannerCenterX(Math.round(r.left + r.width / 2));
    };

    // ResizeObserver로 사이즈 변화에 더 정확히 반응
    const ro = new ResizeObserver(reposition);
    if (writerPaneRef.current) ro.observe(writerPaneRef.current);

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, []);

  /* Portal 준비 */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ✅ 회사/포지션 태그 상태 + 필드별 디바운스 타이머 */
  const [companyTag, setCompanyTag] = useState<string>("");
  const [roleTag, setRoleTag] = useState<string>("");
  const metaTimersRef = useRef<{
    company: ReturnType<typeof setTimeout> | null;
    role: ReturnType<typeof setTimeout> | null;
  }>({ company: null, role: null });

  const saveMeta = useCallback(
    (key: "company" | "role", val: string) => {
      if (!doc) return;
      const timers = metaTimersRef.current;
      if (timers[key]) clearTimeout(timers[key]!);

      setSaveState("saving");
      setSaveMsg("메타 저장 대기…");

      timers[key] = setTimeout(async () => {
        try {
          await updateDocumentMeta(doc.id, key === "company" ? { company: val } : { role: val });
          setSaveState("saved");
          setSaveMsg("메타 저장됨");
          setTimeout(() => setSaveState("idle"), 900);
        } catch {
          setSaveState("error");
          setSaveMsg("메타 저장 실패");
        } finally {
          timers[key] = null;
        }
      }, 250);
    },
    [doc]
  );

  /* 🔧 cleanup에서 ref 스냅샷 사용 (경고 해소) */
  useEffect(() => {
    const timersSnapshot = metaTimersRef.current; // 스냅샷 캡처
    return () => {
      if (timersSnapshot.company) clearTimeout(timersSnapshot.company);
      if (timersSnapshot.role) clearTimeout(timersSnapshot.role);
    };
  }, [doc?.id]);

  /* 문서 로드 */
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!docId) {
        setErr("문서 ID가 없습니다.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/documents?id=${encodeURIComponent(docId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`문서를 불러오지 못했습니다. (HTTP ${res.status})`);
        const data: Doc = await res.json();
        if (!alive) return;

        setDoc(data);
        setTitle(data?.title || "");

        /* ✅ 회사/포지션 태그 초기화 */
        setCompanyTag(data?.company || "");
        setRoleTag(data?.role || "");

        const rawBlocks = data?.content?.blocks || [];
        const docHtml = toDocHtml(rawBlocks);
        setBlocks([{ type: "doc", html: docHtml }]);

        lastSavedHtmlRef.current = docHtml;
        lastSavedTitleRef.current = data?.title || "";
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "문서를 불러오는 중 오류가 발생했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [docId]);

  /* 템플릿 변수 치환 */
  const handleChangeField = useCallback(
    (key: string, val: string) => {
      const newFields = { ...fields, [key]: val };
      setFields(newFields);

      const html = getEditorHtml(editorRef) || blockHtml(blocks);
      const nextHtml = html.replace(/{{(.*?)}}/g, (match, p1) => {
        const k = String(p1).trim();
        const repl = newFields[k];
        return repl !== undefined && repl !== "" ? safeHtml(repl) : match;
      });

      setBlocks([{ type: "doc", html: nextHtml }]);
      setEditorHtml(editorRef, nextHtml);
    },
    [fields, blocks]
  );

  /* Rich-text exec (execCommand, deprecated이지만 브라우저 지원 고려해 유지) */
  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }, []);

  /* 코드블록 토글 */
  const toggleCodeBlock = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = closestBlock(range.startContainer as HTMLElement);
    if (!container) return;

    if ((container as HTMLElement).tagName === "PRE") {
      const code = container.querySelector("code");
      const text = (code ? code.textContent : container.textContent) || "";
      const p = document.createElement("p");
      p.textContent = text;
      container.replaceWith(p);
    } else {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = container.textContent || "";
      pre.appendChild(code);
      container.replaceWith(pre);
    }
    // 상태 반영
    isFromEditorRef.current = true;
    setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
    editorRef.current?.focus();
  }, []);

  /* 링크/체크박스/이미지 */
  const insertLink = useCallback(() => {
    const url = prompt("링크 URL을 입력하세요 (예: https://example.com)");
    if (!url) return;
    exec("createLink", url);
  }, [exec]);

  const insertTodo = useCallback(() => {
    const html = `
      <ul class="todo my-1">
        <li data-checked="false">
          <input type="checkbox" class="mt-1" />
          <div class="todo-text">할 일을 입력하세요</div>
        </li>
      </ul>`;
    insertHtmlAtCaret(html, editorRef);
    isFromEditorRef.current = true;
    setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
  }, []);

  const insertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const onPickImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const html = `<img src="${src}" alt="" class="my-2" />`;
      insertHtmlAtCaret(html, editorRef);
      isFromEditorRef.current = true;
      setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }, []);

  /* 제목 저장 */
  const saveTitle = useCallback(async () => {
    if (!doc) return;
    const next = title.trim() || "제목 없음";
    if (next !== lastSavedTitleRef.current) {
      await renameDocument(doc.id, next);
      lastSavedTitleRef.current = next;
    }
  }, [title, doc]);

  /* 내용/제목 저장 */
  const saveNow = useCallback(async () => {
    if (!doc) return;
    const html = (getEditorHtml(editorRef) || "").trim();
    const titleTrim = title.trim();
    if (html === lastSavedHtmlRef.current && titleTrim === lastSavedTitleRef.current) return;

    setSaveState("saving");
    setSaveMsg("저장중…");
    try {
      if (html !== lastSavedHtmlRef.current) {
        await saveDocumentJson(doc.id, { blocks: [{ type: "doc", html }] });
        lastSavedHtmlRef.current = html;
      }
      if (titleTrim !== lastSavedTitleRef.current) {
        const next = titleTrim || "제목 없음";
        await renameDocument(doc.id, next);
        lastSavedTitleRef.current = next;
      }
      setSaveState("saved");
      setSaveMsg("저장됨");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      console.error(e);
      setSaveState("error");
      setSaveMsg("저장 실패");
    }
  }, [doc, title]);

  /* 자동저장 */
  useEffect(() => {
    if (!doc) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    setSaveMsg("저장 대기…");
    saveTimerRef.current = setTimeout(() => void saveNow(), 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [blocks, title, doc, saveNow]);

  /* 키 핸들링 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // 저장
      if (isCmdOrCtrl(e) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
        return;
      }
      // 서식
      if (isCmdOrCtrl(e) && e.key.toLowerCase() === "b") {
        e.preventDefault(); exec("bold");
      }
      if (isCmdOrCtrl(e) && e.key.toLowerCase() === "i") {
        e.preventDefault(); exec("italic");
      }
      if (isCmdOrCtrl(e) && e.key.toLowerCase() === "u") {
        e.preventDefault(); exec("underline");
      }

      // 슬래시 메뉴 트리거(라인 시작에서 /)
      if (e.key === "/" && isCaretAtLineStart()) {
        setSlashOpen(true);
        return;
      }
      if (e.key === "Escape" && slashOpen) {
        setSlashOpen(false);
        return;
      }

      // 마크다운풍 단축(# + Space 등)
      if (e.key === " ") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const block = closestBlock(range.startContainer as HTMLElement);
        if (!block) return;

        const text = (block.textContent || "").trim();
        const atStart = isCaretAtStart(block, sel);
        if (!atStart) return;

        if (text === "#") {
          e.preventDefault();
          block.textContent = "";
          document.execCommand("formatBlock", false, "h1");
          return;
        }
        if (text === "##") {
          e.preventDefault();
          block.textContent = "";
          document.execCommand("formatBlock", false, "h2");
          return;
        }
        if (text === ">") {
          e.preventDefault();
          block.textContent = "";
          document.execCommand("formatBlock", false, "blockquote");
          return;
        }
        if (text === "-") {
          e.preventDefault();
          block.textContent = "";
          document.execCommand("insertUnorderedList");
          return;
        }
        if (text === "1.") {
          e.preventDefault();
          block.textContent = "";
          document.execCommand("insertOrderedList");
          return;
        }
        if (text === "- [ ]" || text === "[]") {
          e.preventDefault();
          block.textContent = "";
          insertTodo();
          return;
        }
      }

      if (e.key === "Enter") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const block = closestBlock(range.startContainer as HTMLElement);
        if (!block) return;
        const text = block.textContent || "";
        if (text.trim() === "```") {
          e.preventDefault();
          block.textContent = "";
          toggleCodeBlock();
        }
      }
    },
    [exec, toggleCodeBlock, slashOpen, insertTodo, saveNow]
  );

  /* 에디터 입력 → 상태 반영 */
  const handleEditorInput = useCallback(() => {
    isFromEditorRef.current = true;
    const html = getEditorHtml(editorRef);
    setBlocks([{ type: "doc", html }]);
  }, []);

  /* ✅ 붙여넣기 sanitize: 인라인 스타일/스팬 등 제거 */
  const handleEditorPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) {
      e.preventDefault();
      const clean = sanitizeHtml(html);
      insertHtmlAtCaret(clean, editorRef);
      isFromEditorRef.current = true;
      setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
    } else if (text) {
      // 순수 텍스트는 안전 변환
      e.preventDefault();
      const safe = safeHtml(text).replace(/\n/g, "<br>");
      insertHtmlAtCaret(safe, editorRef);
      isFromEditorRef.current = true;
      setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
    }
  }, []);

  /* 체크박스 토글 처리 */
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t && t.tagName === "INPUT" && (t as HTMLInputElement).type === "checkbox") {
      const li = t.closest("li");
      if (li) {
        const checked = (t as HTMLInputElement).checked;
        li.setAttribute("data-checked", checked ? "true" : "false");
        const html = getEditorHtml(editorRef);
        isFromEditorRef.current = true;
        setBlocks([{ type: "doc", html }]);
      }
    }
  }, []);

  /* 에디터 DOM 동기화 */
  useEffect(() => {
    const html = currentHtml;
    if (!isFromEditorRef.current) setEditorHtml(editorRef, html);
    isFromEditorRef.current = false;
  }, [currentHtml]);

  /* PDF 내보내기 */
  const handleDownloadPDF = useCallback(() => {
    const htmlContent = currentHtml;
    const win = window.open("", "_blank");
    if (!win) return;
    const docTitle = (title || "문서").replace(/[\\/:*?"<>|]/g, "_");
    win.document.write(`
      <html>
      <head>
        <title>${docTitle}.pdf</title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; }
          html, body { height: 100%; }
          body {
            font-family: Inter, Pretendard, "Noto Sans KR", system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans", sans-serif;
            margin: 0; color: #111827;
          }
          header { margin: 0 0 10mm; }
          h1 { font-size: 20px; margin: 0 0 6mm; }
          .content { font-size: 12pt; line-height: 1.7; }
          .content img { max-width: 100%; height: auto; border-radius: 4px; }
          pre { background:#f6f8fa; padding:8px 10px; border-radius:6px; overflow:auto; }
          blockquote { border-left: 3px solid #e5e7eb; margin: 8px 0; padding: 4px 12px; color:#6b7280; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
          ul,ol { padding-left: 20px; }
          .todo { list-style: none; padding-left: 0; }
          .todo li { display:flex; gap:8px; align-items:flex-start; }
          .todo li[data-checked="true"] .todo-text { text-decoration: line-through; color:#9ca3af; }
          [data-page-break="before"] { break-before: page; }
          [data-page-break="after"]  { break-after: page; }
        </style>
      </head>
      <body>
        <header><h1>${escapeHtml(title || "제목 없음")}</h1></header>
        <div class="content">${htmlContent}</div>
        <script>
          const imgs = Array.from(document.images);
          if (imgs.length === 0) { window.print(); }
          let left = imgs.length;
          imgs.forEach(img => {
            if (img.complete) { if(--left === 0) window.print(); }
            else { img.onload = img.onerror = () => { if(--left === 0) window.print(); }; }
          });
        </script>
      </body>
      </html>
    `);
    win.document.close();
  }, [currentHtml, title]);

  /* ✅ AI 재생성 */
  const runRegen = useCallback((kind: "resume" | "coverletter") => {
    setRegenMsg("");
    startTransition(async () => {
      try {
        const res = await regenerateDocument(kind);
        setRegenMsg(`${res.title} 생성 완료`);
      } catch (e: any) {
        setRegenMsg(e?.message || "생성 실패");
      }
    });
  }, []);

  /* ✅ AI 패널 연결: 선택영역 텍스트 추출 & 대체 삽입 (+ 치환) */
  const getSelectionHtml = useCallback(() => {
    return window.getSelection()?.toString() ?? "";
  }, []);

  const replaceSelection = useCallback((text: string) => {
    // 1) 치환 컨텍스트 (회사/포지션 태그 기준)
    const ctx = {
      company: (companyTag || "").trim(),
      role: (roleTag || "").trim(),
    };
    // 2) {{company}}, {{role}} 치환
    const filled = fillPlaceholders(text, ctx);

    // 3) 플레인 텍스트 삽입 (출력 오염 방지)
    document.execCommand("insertText", false, filled);

    // 상태 동기화
    isFromEditorRef.current = true;
    setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
    editorRef.current?.focus();
  }, [companyTag, roleTag]);

  /* 로딩/에러 */
  if (loading) return <div className="p-6 text-gray-500">문서 불러오는 중...</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!doc) return <div className="p-6 text-gray-500">문서를 찾을 수 없습니다。</div>;

  /* UI */
  return (
    <div className="p-0 bg-white">
      {/* 데스크톱: 좌우 2열, 모바일: 1열 */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-col lg:flex-row">
        {/* 좌측(유연폭): 작성 영역 넓게 */}
        <div className="min-h-[calc(100vh-64px)] flex-1 min-w-0 lg:border-r">
          <div ref={writerPaneRef} className="mx-auto max-w-5xl px-6 lg:px-10 py-8">
            <input
              className="w-full text-3xl font-semibold tracking-tight outline-none border-0 focus:ring-0 placeholder:text-gray-300"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              placeholder="제목을 입력하세요"
            />

            {/* ✅ 제목 아래: 회사/포지션 태그 편집 바 */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TagCombobox
                type="company"
                value={companyTag}
                placeholder="지원하는 회사명"
                onChange={(v) => {
                  setCompanyTag(v);
                  saveMeta("company", v);
                }}
              />
              <TagCombobox
                type="role"
                value={roleTag}
                placeholder="포지션"
                onChange={(v) => {
                  setRoleTag(v);
                  saveMeta("role", v);
                }}
              />
            </div>

            {/* 툴바 */}
            <div className="sticky top-2 z-10 mt-4 flex items-center gap-1 flex-wrap bg-white/70 backdrop-blur border rounded-xl px-1 py-1 shadow-sm select-none">
              <ToolbarButton onClick={() => exec("bold")} title="굵게 (Ctrl/⌘+B)">B</ToolbarButton>
              <ToolbarButton onClick={() => exec("italic")} title="기울임 (Ctrl/⌘+I)">I</ToolbarButton>
              <ToolbarButton onClick={() => exec("underline")} title="밑줄 (Ctrl/⌘+U)">U</ToolbarButton>

              <ToolbarDivider />
              <ToolbarButton onClick={() => exec("formatBlock", "h1")} title="제목 1">H1</ToolbarButton>
              <ToolbarButton onClick={() => exec("formatBlock", "h2")} title="제목 2">H2</ToolbarButton>
              <ToolbarButton onClick={() => exec("formatBlock", "blockquote")} title="인용문">“ ”</ToolbarButton>
              <ToolbarButton onClick={() => exec("insertHorizontalRule")} title="구분선">—</ToolbarButton>

              <ToolbarDivider />
              <ToolbarButton onClick={() => exec("insertUnorderedList")} title="글머리 목록">•</ToolbarButton>
              <ToolbarButton onClick={() => exec("insertOrderedList")} title="번호 목록">1.</ToolbarButton>
              <ToolbarButton onClick={toggleCodeBlock} title="코드 블록">{`</>`}</ToolbarButton>
              <ToolbarButton onClick={insertTodo} title="체크박스">☑︎</ToolbarButton>
              <ToolbarButton onClick={insertLink} title="링크 삽입">🔗</ToolbarButton>
              <ToolbarButton onClick={insertImage} title="이미지 삽입">🖼</ToolbarButton>

              <div className="ml-auto flex items-center gap-2 pr-1">
                {/* ✅ AI 재생성 */}
                <button
                  disabled={isPending}
                  onClick={() => runRegen("resume")}
                  className="h-8 px-2 text-xs rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
                  type="button"
                  title="이력서_초안을 AI로 다시 생성"
                >
                  {isPending ? "생성 중…" : "이력서 AI 재생성"}
                </button>
                <button
                  disabled={isPending}
                  onClick={() => runRegen("coverletter")}
                  className="h-8 px-2 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                  type="button"
                  title="자기소개서_초안을 AI로 다시 생성"
                >
                  {isPending ? "생성 중…" : "자기소개서 AI 재생성"}
                </button>
                {regenMsg && <span className="text-[11px] text-gray-500">{regenMsg}</span>}

                <span
                  className={
                    "text-xs px-2 py-1 rounded-md border " +
                    (saveState === "saving"
                      ? "text-amber-600 border-amber-200 bg-amber-50"
                      : saveState === "saved"
                      ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                      : saveState === "error"
                      ? "text-rose-600 border-rose-200 bg-rose-50"
                      : "text-gray-500 border-gray-200 bg-white")
                  }
                >
                  {saveMsg || "대기"}
                </span>
                <button
                  className="h-8 px-2 text-xs rounded-lg border bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 shadow-sm"
                  onClick={handleDownloadPDF}
                  title="브라우저 인쇄 대화상자가 열리고 PDF로 저장할 수 있어요."
                  type="button"
                >
                  ⬇️ PDF
                </button>
              </div>
            </div>

            {/* 에디터 */}
            <div
              ref={editorRef}
              className="mt-4 rounded-xl min-h-[58vh] p-5 outline-none bg-white
                         prose prose-neutral max-w-none
                         [&_p]:my-2 [&_h1]:text-3xl [&_h2]:text-2xl
                         [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-4 [&_blockquote]:text-gray-600
                         [&_pre]:bg-gray-50 [&_pre]:p-3 [&_pre]:rounded-lg
                         [&_.todo]:list-none [&_.todo>li]:m-0"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleKeyDown}
              onClick={handleEditorClick}
              onPaste={handleEditorPaste}
              aria-label="문서 에디터"
              data-placeholder="여기에 내용을 입력하세요…"
            />

            {/* 에디터 placeholder */}
            <style jsx>{`
              [contenteditable][data-placeholder]:empty:before {
                content: attr(data-placeholder);
                color: #9ca3af;
                pointer-events: none;
              }
            `}</style>

            {/* 이미지 파일 입력(숨김) */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          </div>
        </div>

        {/* 우측 사이드 — ✅ AI 패널 장착 */}
        <div className="min-h-[calc(100vh-64px)] w-full lg:w-[320px] relative border-l bg-white">
          <DocAiPanel
            company={companyTag}
            role={roleTag}
            getSelectionHtml={getSelectionHtml}
            replaceSelection={replaceSelection}
          />
        </div>
      </div>

      {/* 하단 플로팅 배너 — Portal */}
      {mounted && bannerCenterX !== null &&
        createPortal(
          <div
            className="fixed z-[9999]"
            style={{ left: `${bannerCenterX}px`, transform: "translateX(-50%)", bottom: "112px" }} /* ⬆ 기존보다 16px 위 */
          >
            <button
              onClick={() => {
                setPreviewHtmlSnap(currentHtml);
                setPreviewOpen(true);
              }}
              className="shadow-xl rounded-full border bg-white/90 backdrop-blur px-4 py-2 text-sm flex items-center gap-2 hover:bg-white active:scale-[0.99] transition"
              title="미리보기로 A4 페이지 분할 상태를 확인합니다"
              type="button"
            >
              미리보기 ▸
            </button>
          </div>,
          document.body
        )}

      {/* 미리보기 모달 — Portal */}
      {mounted && previewOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9998]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setPreviewOpen(false)} aria-hidden="true" />
            <div className="absolute inset-4 md:inset-8 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-white/70 backdrop-blur">
                <div className="text-sm text-gray-600">A4 미리보기</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className="h-8 px-3 text-sm rounded-lg border bg-white hover:bg-gray-50"
                    type="button"
                  >
                    닫기 ✕
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 bg-gray-50">
                <A4Preview html={previewHtmlSnap || currentHtml} autoScale showToolbar />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/* ---------- UI 소품 ---------- */
function ToolbarButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      className={
        "inline-flex items-center justify-center gap-1 h-8 px-2 text-xs " +
        "rounded-lg border bg-white hover:bg-gray-50 active:bg-gray-100 " +
        "text-gray-700 shadow-sm transition whitespace-nowrap break-keep leading-none select-none " +
        className
      }
      {...rest}
      type="button"
    />
  );
}
function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

/* ---------- 유틸 ---------- */
function getEditorHtml(ref: React.RefObject<HTMLDivElement>) {
  return (ref.current?.innerHTML || "").trim();
}
function setEditorHtml(ref: React.RefObject<HTMLDivElement>, html: string) {
  if (ref.current) ref.current.innerHTML = html || "";
}
function blockHtml(blocks: Block[]) {
  if (!blocks || blocks.length === 0) return "";
  const doc = (blocks as any[]).find((b) => (b as any).html) as any;
  if (doc?.html) return doc.html;
  const lines = (blocks as any[]).map((b) => (b.text ? escapeHtml(b.text) : "")).join("</p><p>");
  return `<p>${lines}</p>`;
}
function toDocHtml(blocks: Block[]) {
  return blockHtml(blocks);
}
function escapeHtml(str: string) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function safeHtml(str: string) {
  return escapeHtml(str).replace(/\n/g, "<br>");
}
function closestBlock(node: HTMLElement | Node | null): HTMLElement | null {
  let el = node as HTMLElement | null;
  while (el && (el as any).nodeType === 3) el = (el as any).parentElement;
  while (el && !/^(P|DIV|LI|H1|H2|BLOCKQUOTE|PRE|UL|OL)$/.test((el as HTMLElement).tagName)) el = (el as any).parentElement;
  return el;
}
function isCaretAtStart(block: HTMLElement, sel: Selection) {
  if (!sel.anchorNode) return false;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(block);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  const textBefore = range.toString();
  return textBefore.trim() === "";
}
function isCaretAtLineStart() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const block = closestBlock(sel.getRangeAt(0).startContainer as HTMLElement);
  if (!block) return false;
  return isCaretAtStart(block, sel);
}
function insertHtmlAtCaret(html: string, editorRef: React.RefObject<HTMLDivElement>) {
  editorRef.current?.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const el = document.createElement("div");
  el.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node: ChildNode | null;
  while ((node = el.firstChild)) frag.appendChild(node);
  range.insertNode(frag);
  sel.collapseToEnd();
}

/* ✅ 플레이스홀더 치환 유틸 */
function fillPlaceholders(s: string, ctx: Record<string, string>) {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] ?? ""));
}
