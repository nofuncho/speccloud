"use client";

import type React from "react";
import { useEffect, useState, useCallback, useRef, useMemo, useTransition } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { renameDocument, saveDocumentJson } from "@/app/actions/folderActions";
import { regenerateDocument } from "@/app/actions/regenerateActions";
import {
  Plus,
  ChevronDown,
  Heading2,
  Type,
  List,
  Columns,
  Table,
  Wrench,
  Languages,
  ClipboardList,
  Sparkles,
  GraduationCap,
  ScrollText,
  IdCard,
  KanbanSquare,
  Rows4,
  BarChart3,
  Award,
  MessageSquareQuote,
  Contact as ContactIcon,
  Grid3x3,
  Stars,
  History,
  SlidersHorizontal,
  GalleryHorizontal,
  GitFork,
  Mic,
  Medal,
  UsersRound,
  CalendarClock,
  QrCode,
  NotebookPen,
  Hash,
  Target,
  ListChecks,
  LayoutTemplate,
  Save,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

/* ---------- 특화 템플릿 ---------- */
type QuickBlock =
  | { kind: "h"; level?: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "kv"; labels: string[] }
  | { kind: "twocol"; items: string[] }
  | { kind: "tools" }
  | { kind: "lang" }
  | { kind: "exp" }
  | { kind: "edu" }
  | { kind: "skills" }               // ✅ 스킬 섹션(칩)
  | { kind: "edu-card" }             // ✅ 학력 카드
  | { kind: "edu-row" }              // ✅ 학력 텍스트형
  | { kind: "exp-card" }             // ✅ 경력 카드형
  | { kind: "exp-row" };             // ✅ 경력 텍스트형
type QuickTemplate = { id: string; name: string; tags?: string[]; blocks: QuickBlock[] };
type QuickAction = { key: string; label: string; icon: LucideIcon; onClick: () => void; description?: string };
type QuickActionGroup = { title: string; items: QuickAction[] };

/* ---------- 유틸 공통 ---------- */
const isCmdOrCtrl = (e: KeyboardEvent | React.KeyboardEvent) => (e.metaKey || e.ctrlKey);

/** 허용 태그만 남기고 붙여넣기 sanitize (표/스팬/버튼 허용 확장) */
function sanitizeHtml(html: string): string {
  const ALLOWED = new Set([
    "P","DIV","H1","H2","UL","OL","LI","BLOCKQUOTE","PRE","CODE","A","IMG","STRONG","EM","U","BR","HR",
    "TABLE","THEAD","TBODY","TR","TH","TD","SPAN","BUTTON","SMALL","SECTION","HEADER","H3","H4"
  ]);
  const WRAP = document.createElement("div");
  WRAP.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (!ALLOWED.has(el.tagName)) {
        const text = document.createTextNode(el.textContent || "");
        el.replaceWith(text); return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const isAllowedAttr =
          (el.tagName === "A" && (name === "href" || name === "target" || name === "rel")) ||
          (el.tagName === "IMG" && (name === "src" || name === "alt"));
        if (!isAllowedAttr) el.removeAttribute(name);
      });
      el.removeAttribute("style");
    }
    let child = node.firstChild;
    while (child) { const next = child.nextSibling; walk(child); child = next; }
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

  /* 특수 업로드 타겟(학력/경력/프로젝트/추천사/연락처 로고/아바타) */
  const logoTargetRef = useRef<HTMLImageElement | null>(null);
  const quickMenuContainerRef = useRef<HTMLDivElement | null>(null);

  /* 내부 ref */
  const isFromEditorRef = useRef(false);
  const lastSavedHtmlRef = useRef<string>("");
  const lastSavedTitleRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* /, ESC */
  const [slashOpen, setSlashOpen] = useState(false);

  /* 미리보기 모달/배너 */
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentHtml = useMemo(() => blockHtml(blocks), [blocks]);
  const [previewHtmlSnap, setPreviewHtmlSnap] = useState<string>("");

  const writerPaneRef = useRef<HTMLDivElement | null>(null);
  const [bannerCenterX, setBannerCenterX] = useState<number | null>(null);

  useEffect(() => {
    const reposition = () => {
      const r = writerPaneRef.current?.getBoundingClientRect();
      if (!r) return;
      setBannerCenterX(Math.round(r.left + r.width / 2));
    };
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ✅ 회사/포지션 태그 */
  const [companyTag, setCompanyTag] = useState<string>("");
  const [roleTag, setRoleTag] = useState<string>("");
  const metaTimersRef = useRef<{ company: ReturnType<typeof setTimeout> | null; role: ReturnType<typeof setTimeout> | null; }>({ company: null, role: null });

  const saveMeta = useCallback(
    (key: "company" | "role", val: string) => {
      if (!doc) return;
      const timers = metaTimersRef.current;
      if (timers[key]) clearTimeout(timers[key]!);
      setSaveState("saving"); setSaveMsg("메타 저장 대기…");
      timers[key] = setTimeout(async () => {
        try {
          await updateDocumentMeta(doc.id, key === "company" ? { company: val } : { role: val });
          setSaveState("saved"); setSaveMsg("메타 저장됨");
          setTimeout(() => setSaveState("idle"), 900);
        } catch {
          setSaveState("error"); setSaveMsg("메타 저장 실패");
        } finally {
          timers[key] = null;
        }
      }, 250);
    },
    [doc]
  );

  useEffect(() => {
    const timersSnapshot = metaTimersRef.current;
    return () => {
      if (timersSnapshot.company) clearTimeout(timersSnapshot.company);
      if (timersSnapshot.role) clearTimeout(timersSnapshot.role);
    };
  }, [doc?.id]);

  /* 문서 로드 */
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!docId) { setErr("문서 ID가 없습니다."); setLoading(false); return; }
      setLoading(true); setErr(null);
      try {
        const res = await fetch(`/api/documents?id=${encodeURIComponent(docId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`문서를 불러오지 못했습니다. (HTTP ${res.status})`);
        const data: Doc = await res.json();
        if (!alive) return;
        setDoc(data);
        setTitle(data?.title || "");
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
    return () => { alive = false; };
  }, [docId]);

  /* 템플릿 변수 치환 */
  const handleChangeField = useCallback((key: string, val: string) => {
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
  }, [fields, blocks]);

  /* Rich-text exec */
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
    logoTargetRef.current = null; // 일반 이미지 모드
    fileInputRef.current?.click();
  }, []);
  const onPickImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      if (logoTargetRef.current) {
        logoTargetRef.current.src = src;     // ✅ 지정 블록 로고/아바타만 교체
        logoTargetRef.current = null;
        isFromEditorRef.current = true;
        setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
      } else {
        const html = `<img src="${src}" alt="" class="my-2" />`;
        insertHtmlAtCaret(html, editorRef);
        isFromEditorRef.current = true;
        setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
      }
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

    setSaveState("saving"); setSaveMsg("저장중…");
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
      setSaveState("saved"); setSaveMsg("저장됨");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      console.error(e);
      setSaveState("error"); setSaveMsg("저장 실패");
    }
  }, [doc, title]);

  /* 자동저장 */
  useEffect(() => {
    if (!doc) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving"); setSaveMsg("저장 대기…");
    saveTimerRef.current = setTimeout(() => void saveNow(), 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [blocks, title, doc, saveNow]);

  /* ---------- KPI 배지 유틸 & 단축키 ---------- */
  const makeKpiBadge = (label: string, value?: string) => {
    const v = value ? `<span class="ml-1 font-semibold">${value}</span>` : "";
    return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs border border-gray-300 bg-gray-50"><span class="opacity-70">${label}</span>${v}</span>`;
  };

  /* 키 핸들링 */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isCmdOrCtrl(e) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveNow(); return; }
    if (isCmdOrCtrl(e) && e.key.toLowerCase() === "b") { e.preventDefault(); exec("bold"); }
    if (isCmdOrCtrl(e) && e.key.toLowerCase() === "i") { e.preventDefault(); exec("italic"); }
    if (isCmdOrCtrl(e) && e.key.toLowerCase() === "u") { e.preventDefault(); exec("underline"); }

    // ✅ KPI 배지: Ctrl/⌘ + Alt + K
    if ((isCmdOrCtrl(e)) && e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const label = prompt("KPI 레이블(예: 전환율):");
      if (!label) return;
      const val = prompt("값/증감(예: +18% YoY):") || "";
      insertHtmlAtCaret(makeKpiBadge(label, val), editorRef);
      isFromEditorRef.current = true;
      setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
      return;
    }

    if (e.key === "/" && isCaretAtLineStart()) { setSlashOpen(true); return; }
    if (e.key === "Escape" && slashOpen) { setSlashOpen(false); return; }

    if (e.key === " ") {
      const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0); const block = closestBlock(range.startContainer as HTMLElement); if (!block) return;
      const text = (block.textContent || "").trim(); const atStart = isCaretAtStart(block, sel); if (!atStart) return;
      if (text === "#")   { e.preventDefault(); block.textContent = ""; document.execCommand("formatBlock", false, "h1"); return; }
      if (text === "##")  { e.preventDefault(); block.textContent = ""; document.execCommand("formatBlock", false, "h2"); return; }
      if (text === ">")   { e.preventDefault(); block.textContent = ""; document.execCommand("formatBlock", false, "blockquote"); return; }
      if (text === "-")   { e.preventDefault(); block.textContent = ""; document.execCommand("insertUnorderedList"); return; }
      if (text === "1.")  { e.preventDefault(); block.textContent = ""; document.execCommand("insertOrderedList"); return; }
      if (text === "- [ ]" || text === "[]") { e.preventDefault(); block.textContent = ""; insertTodo(); return; }
    }

    if (e.key === "Enter") {
      const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0); const block = closestBlock(range.startContainer as HTMLElement); if (!block) return;
      const text = block.textContent || "";
      if (text.trim() === "```") { e.preventDefault(); block.textContent = ""; toggleCodeBlock(); }
    }
  }, [exec, toggleCodeBlock, slashOpen, insertTodo, saveNow]);

  /* 에디터 입력 → 상태 반영 */
  const handleEditorInput = useCallback(() => {
    isFromEditorRef.current = true;
    const html = getEditorHtml(editorRef);
    setBlocks([{ type: "doc", html }]);
  }, []);

  /* ✅ 클릭 핸들링: 체크박스 + 디자인블록 조작 */
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const t = (e.target as HTMLElement);
    const action = t?.dataset?.action;

    if (action === "block-delete" || action === "block-move-up" || action === "block-move-down") {
      const block = t.closest<HTMLElement>("section[data-block]");
      const root = editorRef.current;
      if (!block || !root) return;
      if (action === "block-delete") {
        block.remove();
        root.focus();
        afterInsert();
        return;
      }
      if (action === "block-move-up") {
        let prev = block.previousElementSibling as HTMLElement | null;
        while (prev && !(prev.matches?.("section[data-block]"))) {
          prev = prev.previousElementSibling as HTMLElement | null;
        }
        if (prev) {
          prev.before(block);
        } else {
          root.insertBefore(block, root.firstChild);
        }
        root.focus();
        afterInsert();
        return;
      }
      if (action === "block-move-down") {
        let next = block.nextElementSibling as HTMLElement | null;
        while (next && !(next.matches?.("section[data-block]"))) {
          next = next.nextElementSibling as HTMLElement | null;
        }
        if (next) {
          next.after(block);
        } else {
          root.appendChild(block);
        }
        root.focus();
        afterInsert();
        return;
      }
    }

    // 체크박스 토글
    if (t && t.tagName === "INPUT" && (t as HTMLInputElement).type === "checkbox") {
      const li = t.closest("li");
      if (li) {
        const checked = (t as HTMLInputElement).checked;
        li.setAttribute("data-checked", checked ? "true" : "false");
        const html = getEditorHtml(editorRef);
        isFromEditorRef.current = true;
        setBlocks([{ type: "doc", html }]);
      }
      return;
    }

    // ✅ 스킬: + 추가
    if (t?.dataset?.action === "add-skill") {
      const val = prompt("추가할 스킬을 입력하세요");
      if (!val) return;
      const btn = t;
      const chip = document.createElement("span");
      chip.className = "sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm";
      chip.setAttribute("data-chip", "1");
      chip.contentEditable = "true";
      chip.textContent = val;
      btn.before(chip);
      afterInsert();
      return;
    }

    // ✅ 스킬: Alt/⌘+클릭 삭제
    if (t?.dataset?.chip === "1" && (e.altKey || e.metaKey)) { t.remove(); afterInsert(); return; }

    // ✅ 학력: 카드/텍스트 전환
    if (t?.dataset?.action === "edu-variant") {
      const variant = t.dataset.variant as ("card" | "text");
      const wrap = t.closest('[data-block="edu"]') as HTMLElement | null;
      if (!wrap) return;
      switchEduVariant(wrap, variant);
      afterInsert(); return;
    }

    // ✅ 학력: 로고 업로드
    if (t?.dataset?.action === "edu-upload-logo") {
      const wrap = t.closest('[data-block="edu"]') as HTMLElement | null;
      if (!wrap) return;
      const img = wrap.querySelector("img[data-field='logo']") as HTMLImageElement | null;
      if (!img) return;
      logoTargetRef.current = img; fileInputRef.current?.click(); return;
    }

    // =========================
    // ✅ 경력: 카드/텍스트 전환
    if (t?.dataset?.action === "exp-variant") {
      const variant = t.dataset.variant as ("card" | "text");
      const wrap = t.closest('[data-block="exp"]') as HTMLElement | null;
      if (!wrap) return;
      switchExpVariant(wrap, variant);
      afterInsert(); return;
    }

    // ✅ 경력: 성과 항목 추가
    if (t?.dataset?.action === "exp-add-bullet") {
      const wrap = t.closest('[data-block="exp"]') as HTMLElement | null;
      const list = wrap?.querySelector('ol[data-field="bullets"]');
      if (list) {
        const li = document.createElement("li");
        li.contentEditable = "true";
        li.textContent = "성과/지표를 입력하세요";
        (list as HTMLOListElement).appendChild(li);
        afterInsert();
      }
      return;
    }

    // ✅ 경력: 로고 업로드
    if (t?.dataset?.action === "exp-upload-logo") {
      const wrap = t.closest('[data-block="exp"]') as HTMLElement | null;
      if (!wrap) return;
      const img = wrap.querySelector("img[data-field='logo']") as HTMLImageElement | null;
      if (!img) return;
      logoTargetRef.current = img; fileInputRef.current?.click(); return;
    }

    // ✅ 경력: 삭제
    if (t?.dataset?.action === "exp-delete") {
      const wrap = t.closest('[data-block="exp"]') as HTMLElement | null;
      if (wrap) { wrap.remove(); afterInsert(); }
      return;
    }

    // ✅ 경력: 아래에 새 카드 추가
    if (t?.dataset?.action === "exp-add-below") {
      const wrap = t.closest('[data-block="exp"]') as HTMLElement | null;
      if (!wrap) return;
      wrap.insertAdjacentHTML("afterend", expCardHtml());
      afterInsert(); return;
    }

    // ✅ 경력/프로젝트 공통: Alt/⌘+클릭으로 성과 항목 삭제
    if (t?.closest('ol[data-field="bullets"] li') && (e.altKey || e.metaKey)) {
      const li = t.closest('li'); if (li) { li.remove(); afterInsert(); }
      return;
    }

    // =========================
    // ✅ 프로젝트: 카드/텍스트 전환
    if (t?.dataset?.action === "proj-variant") {
      const wrap = t.closest('[data-block="proj"]') as HTMLElement | null;
      if (wrap) { switchProjVariant(wrap, t.dataset.variant as ("card"|"text")); afterInsert(); }
      return;
    }
    // ✅ 프로젝트: 성과 추가
    if (t?.dataset?.action === "proj-add-bullet") {
      const wrap = t.closest('[data-block="proj"]') as HTMLElement | null;
      const list = wrap?.querySelector('ol[data-field="bullets"]');
      if (list) { const li = document.createElement("li"); li.contentEditable = "true"; li.textContent = "성과를 입력하세요"; (list as HTMLOListElement).appendChild(li); afterInsert(); }
      return;
    }
    // ✅ 프로젝트: 로고 업로드
    if (t?.dataset?.action === "proj-upload-logo") {
      const wrap = t.closest('[data-block="proj"]') as HTMLElement | null;
      const img = wrap?.querySelector("img[data-field='logo']") as HTMLImageElement | null;
      if (img) { logoTargetRef.current = img; fileInputRef.current?.click(); }
      return;
    }
    // ✅ 프로젝트: 아래에 추가
    if (t?.dataset?.action === "proj-add-below") {
      const wrap = t.closest('[data-block="proj"]') as HTMLElement | null;
      if (wrap) { wrap.insertAdjacentHTML("afterend", projCardHtml()); afterInsert(); }
      return;
    }
    // ✅ 프로젝트: 카드 삭제
    if (t?.dataset?.action === "proj-delete") {
      const wrap = t.closest('[data-block="proj"]') as HTMLElement | null;
      if (wrap) { wrap.remove(); afterInsert(); }
      return;
    }

    // =========================
    // ✅ 추천사: 아바타 업로드/삭제
    if (t?.dataset?.action === "quote-upload-avatar") {
      const wrap = t.closest('[data-block="quote"]') as HTMLElement | null;
      const img = wrap?.querySelector("img[data-field='avatar']") as HTMLImageElement | null;
      if (img) { logoTargetRef.current = img; fileInputRef.current?.click(); }
      return;
    }
    if (t?.dataset?.action === "quote-delete") {
      const wrap = t.closest('[data-block="quote"]') as HTMLElement | null;
      if (wrap) { wrap.remove(); afterInsert(); }
      return;
    }

    // ✅ 연락처: 아바타 업로드
    if (t?.dataset?.action === "contact-upload-avatar") {
      const wrap = t.closest('[data-block="contact"]') as HTMLElement | null;
      const img = wrap?.querySelector("img[data-field='avatar']") as HTMLImageElement | null;
      if (img) { logoTargetRef.current = img; fileInputRef.current?.click(); }
      return;
    }

  }, []);

  /* PDF 내보내기 */
  const handleDownloadPDF = useCallback(() => {
    const htmlContent = currentHtml;
    const win = window.open("", "_blank"); if (!win) return;
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
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; }
          th { background: #f9fafb; text-align: left; white-space: nowrap; }
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

  /* ✅ AI 패널 연결 */
  const getSelectionHtml = useCallback(() => {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return "";
    return sel.toString();
  }, []);

  const replaceSelection = useCallback((text: string) => {
    const ctx = { company: (companyTag || "").trim(), role: (roleTag || "").trim() };
    const filled = fillPlaceholders(text, ctx);
    const root = editorRef.current; if (root) root.focus();
    try { document.execCommand("insertText", false, filled); }
    catch {
      const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0); range.deleteContents(); range.insertNode(document.createTextNode(filled)); sel.collapseToEnd();
    }
    isFromEditorRef.current = true;
    setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
    editorRef.current?.focus();
  }, [companyTag, roleTag]);

  /* =========================================================
     ✅ 이력서/자소서 특화 블록 삽입기 + 디자인형 섹션
  ========================================================= */
  const decorateBlocks = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section[data-block]"));
    sections.forEach((section) => {
      if (!section.dataset.scEnhanced) {
        section.dataset.scEnhanced = "1";
      }
      section.classList.add("relative", "group");

      if (!section.querySelector<HTMLElement>("[data-editor-ui='handle']")) {
        const highlight = document.createElement("div");
        highlight.setAttribute("data-editor-ui", "handle");
        highlight.setAttribute("data-role", "block-highlight");
        highlight.setAttribute("contenteditable", "false");
        highlight.className =
          "pointer-events-none absolute inset-0 rounded-xl border border-transparent transition duration-150 ease-out group-hover:border-indigo-200 group-hover:shadow-sm";
        section.appendChild(highlight);
      }

      if (!section.querySelector<HTMLElement>("[data-editor-ui='toolbar']")) {
        const toolbar = document.createElement("div");
        toolbar.setAttribute("data-editor-ui", "toolbar");
        toolbar.setAttribute("contenteditable", "false");
        toolbar.className =
          "pointer-events-auto absolute -left-11 top-3 hidden flex-col gap-1 rounded-lg border border-gray-200 bg-white/95 px-1.5 py-1.5 text-xs text-gray-600 shadow-lg ring-1 ring-black/5 group-hover:flex group-focus-within:flex";
        toolbar.innerHTML = `
          <button type="button" data-action="block-move-up" class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white hover:border-gray-300 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200" title="위로 이동">↑</button>
          <button type="button" data-action="block-move-down" class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white hover:border-gray-300 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200" title="아래로 이동">↓</button>
          <button type="button" data-action="block-delete" class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-rose-500 hover:border-rose-300 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200" title="삭제">✕</button>
        `;
        toolbar.addEventListener("mousedown", (ev) => ev.preventDefault());
        section.appendChild(toolbar);
      }
    });
  }, []);

  const afterInsert = useCallback(() => {
    decorateBlocks();
    isFromEditorRef.current = true;
    setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
  }, [decorateBlocks]);

  /* ✅ 붙여넣기 sanitize */
  const handleEditorPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) {
      e.preventDefault();
      const clean = sanitizeHtml(html);
      insertHtmlAtCaret(clean, editorRef);
      isFromEditorRef.current = true;
      setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
      decorateBlocks();
    } else if (text) {
      e.preventDefault();
      const safe = safeHtml(text).replace(/\n/g, "<br>");
      insertHtmlAtCaret(safe, editorRef);
      isFromEditorRef.current = true;
      setBlocks([{ type: "doc", html: getEditorHtml(editorRef) }]);
      decorateBlocks();
    }
  }, [decorateBlocks]);

  /* 에디터 DOM 동기화 */
  useEffect(() => {
    const html = currentHtml;
    if (!isFromEditorRef.current) setEditorHtml(editorRef, html);
    decorateBlocks();
    isFromEditorRef.current = false;
  }, [currentHtml, decorateBlocks]);

  const insertHeading = (text: string, level: 1 | 2 | 3 = 2) => {
    insertHtmlAtCaret(`<h${level} class="mt-4 mb-2 font-semibold">${escapeHtml(text)}</h${level}>`, editorRef);
    afterInsert();
  };
  const insertParagraph = (text: string) => {
    insertHtmlAtCaret(`<p class="mb-2">${safeHtml(text)}</p>`, editorRef);
    afterInsert();
  };
  const insertBullet = (items: string[]) => {
    const lis = items.map(i => `<li>${escapeHtml(i)}</li>`).join("");
    insertHtmlAtCaret(`<ul class="list-disc pl-6 mb-2">${lis}</ul>`, editorRef);
    afterInsert();
  };
  // 2열 표
  const insertTwoCol = (items: string[]) => {
    const half = Math.ceil(items.length / 2);
    const left = items.slice(0, half);
    const right = items.slice(half);
    const rows = Math.max(left.length, right.length);
    const trs = Array.from({ length: rows }, (_, i) =>
      `<tr><td class="align-top p-2 border">${escapeHtml(left[i] ?? "")}</td><td class="align-top p-2 border">${escapeHtml(right[i] ?? "")}</td></tr>`
    ).join("");
    insertHtmlAtCaret(`<table class="w-full border-collapse mb-2"><tbody>${trs}</tbody></table>`, editorRef);
    afterInsert();
  };
  // Key-Value 프로필 표
  const insertKeyValue = (labels: string[]) => {
    const trs = labels.map(l => `<tr><th class="text-right whitespace-nowrap p-2 border bg-gray-50">${escapeHtml(l)}</th><td class="p-2 border"></td></tr>`).join("");
    insertHtmlAtCaret(`<table class="w-full border-collapse mb-2"><tbody>${trs}</tbody></table>`, editorRef);
    afterInsert();
  };
  // 툴 숙련도 표
  const insertToolsTable = () => {
    const head = `<tr><th class="p-2 border bg-gray-50">툴</th><th class="p-2 border bg-gray-50">숙련도</th><th class="p-2 border bg-gray-50">메모</th></tr>`;
    const rows = Array.from({ length: 3 }, () => `<tr><td class="p-2 border"></td><td class="p-2 border"></td><td class="p-2 border"></td></tr>`).join("");
    insertHtmlAtCaret(`<table class="w-full border-collapse mb-2"><thead>${head}</thead><tbody>${rows}</tbody></table>`, editorRef);
    afterInsert();
  };
  // 어학 점수 표
  const insertLanguageScoreTable = () => {
    const head = `<tr><th class="p-2 border bg-gray-50">언어/시험</th><th class="p-2 border bg-gray-50">점수</th><th class="p-2 border bg-gray-50">취득일</th></tr>`;
    const rows = Array.from({ length: 3 }, () => `<tr><td class="p-2 border"></td><td class="p-2 border"></td><td class="p-2 border"></td></tr>`).join("");
    insertHtmlAtCaret(`<table class="w-full border-collapse mb-2"><thead>${head}</thead><tbody>${rows}</tbody></table>`, editorRef);
    afterInsert();
  };
  // 경력/학력(기본)
  const insertExperienceSection = () => {
    insertHeading("경력", 2);
    insertParagraph("회사명 / 직무 / 재직기간");
    insertBullet(["주요성과 1 — 수치/지표 포함", "주요성과 2 — 액션 동사로 시작", "사용 기술/툴"]);
  };
  const insertEducationSection = () => {
    insertHeading("학력", 2);
    insertBullet(["학교 / 전공 / 기간", "학점 / 수상 / 활동"]);
  };

  /* ---------- 디자인형: 스킬 섹션(칩) ---------- */
  const insertSkillSection = () => {
    const html = `
      <section class="sc-section mb-5" data-block="skills">
        <h2 class="text-xl font-semibold mb-2">스킬</h2>
        <div class="sc-chip-list flex flex-wrap gap-2">
          <span class="sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm" data-chip="1" contenteditable="true">Figma</span>
          <span class="sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm" data-chip="1" contenteditable="true">Notion</span>
          <span class="sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm" data-chip="1" contenteditable="true">Slack</span>
          <button class="sc-chip-add rounded-full border px-3 py-1 text-sm bg-white/70 hover:bg-white"
                  contenteditable="false" data-action="add-skill">+ 추가</button>
        </div>
      </section>
    `;
    insertHtmlAtCaret(html, editorRef);
    afterInsert();
  };

  /* ---------- 디자인형: 학력 카드/텍스트 ---------- */
  const defaultEduFields = () => ({
    logo: "https://dummyimage.com/72x72/efefef/aaaaaa.png&text=U",
    school: "학교명",
    period: "2013.03 - 2016.06",
    status: "재학",
    major: "전공",
    detail: "세부내용을 입력하세요",
  });

  const eduCardHtml = (f = defaultEduFields()) => `
    <section class="sc-edu mb-4" data-block="edu" data-variant="card">
      <div class="flex items-center gap-3">
        <img data-field="logo" src="${f.logo}" alt="" class="w-9 h-9 rounded object-cover" />
        <div class="min-w-0">
          <div class="font-semibold">${escapeHtml(f.school)}</div>
          <div class="text-gray-500 text-sm whitespace-nowrap">${escapeHtml(f.period)} <span class="mx-2">·</span> ${escapeHtml(f.status)} <span class="mx-2">·</span> ${escapeHtml(f.major)}</div>
        </div>
      </div>
      <div class="text-sm text-gray-600 mt-2" data-field="detail" contenteditable="true">${escapeHtml(f.detail)}</div>
      <div class="sc-edu-controls not-prose mt-2 flex gap-2">
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="edu-variant" data-variant="card" contenteditable="false">카드형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="edu-variant" data-variant="text" contenteditable="false">텍스트형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="edu-upload-logo" contenteditable="false">로고</button>
      </div>
      <div class="hidden" data-raw>
        <span data-field="school" contenteditable="true">${escapeHtml(f.school)}</span>
        <span data-field="period" contenteditable="true">${escapeHtml(f.period)}</span>
        <span data-field="status" contenteditable="true">${escapeHtml(f.status)}</span>
        <span data-field="major"  contenteditable="true">${escapeHtml(f.major)}</span>
      </div>
    </section>
  `;

  const eduRowHtml = (f = defaultEduFields()) => `
    <section class="sc-edu mb-3" data-block="edu" data-variant="text">
      <h3 class="text-base font-semibold mb-1">학력</h3>
      <div class="text-[15px]">
        <strong contenteditable="true" data-field="school">${escapeHtml(f.school)}</strong>
        <span class="text-gray-400 mx-2">|</span>
        <span contenteditable="true" data-field="period">${escapeHtml(f.period)}</span>
        <span class="text-gray-400 mx-2">|</span>
        <span contenteditable="true" data-field="status">${escapeHtml(f.status)}</span>
        <span class="text-gray-400 mx-2">|</span>
        <span contenteditable="true" data-field="major">${escapeHtml(f.major)}</span>
      </div>
      <div class="text-sm text-gray-600 mt-1" contenteditable="true" data-field="detail">${escapeHtml(f.detail)}</div>
      <div class="sc-edu-controls not-prose mt-2 flex gap-2">
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="edu-variant" data-variant="card" contenteditable="false">카드형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="edu-variant" data-variant="text" contenteditable="false">텍스트형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="edu-upload-logo" contenteditable="false">로고</button>
      </div>
      <img data-field="logo" src="${f.logo}" alt="" class="hidden" />
    </section>
  `;

  const readEduFields = (wrap: HTMLElement) => {
    const f = defaultEduFields();
    const img = wrap.querySelector("img[data-field='logo']") as HTMLImageElement | null;
    const pick = (q: string, def: string) => {
      const el = wrap.querySelector(`[data-field='${q}']`) as HTMLElement | null;
      return (el?.textContent ?? def).toString().trim() || def;
    };
    return {
      logo: img?.getAttribute("src") || f.logo,
      school: pick("school", f.school),
      period: pick("period", f.period),
      status: pick("status", f.status),
      major:  pick("major",  f.major),
      detail: pick("detail", f.detail),
    };
  };

  const switchEduVariant = (wrap: HTMLElement, variant: "card" | "text") => {
    const f = readEduFields(wrap);
    if (variant === "card") wrap.outerHTML = eduCardHtml(f);
    else wrap.outerHTML = eduRowHtml(f);
  };

  const insertEducationCard = () => { insertHtmlAtCaret(eduCardHtml(), editorRef); afterInsert(); };
  const insertEducationRow  = () => { insertHtmlAtCaret(eduRowHtml(),  editorRef); afterInsert(); };

  /* ---------- 디자인형: 경력 카드/텍스트 ---------- */
  const defaultExpFields = () => ({
    logo: "https://dummyimage.com/72x72/e5e7eb/9ca3af.png&text=C",
    company: "회사명",
    title: "직책/직무",
    period: "2024.03 - 2025.06",
    emp: "정규직",
    desc: "요약 또는 포지션 설명을 입력하세요",
    bullets: ["성과 1 — 수치/지표 포함", "성과 2 — 액션 동사로 시작", "성과 3 — 사용자/매출/속도 지표"],
  });

  const expCardHtml = (f = defaultExpFields()) => `
    <section class="sc-exp mb-4 p-3 border rounded-xl bg-white/80 shadow-sm" data-block="exp" data-variant="card">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <img data-field="logo" src="${f.logo}" alt="" class="w-9 h-9 rounded object-cover" />
          <div class="min-w-0">
            <div class="font-semibold text-[15px]" data-field="company" contenteditable="true">${escapeHtml(f.company)}</div>
            <div class="text-gray-500 text-xs whitespace-nowrap" data-field="period" contenteditable="true">${escapeHtml(f.period)}</div>
          </div>
        </div>
        <div class="text-xs text-gray-500 whitespace-nowrap">
          <span data-field="emp" contenteditable="true">${escapeHtml(f.emp)}</span>
        </div>
      </div>

      <div class="mt-2 text-[15px]">
        <strong data-field="title" contenteditable="true">${escapeHtml(f.title)}</strong>
      </div>
      <div class="text-sm text-gray-600 mt-1" data-field="desc" contenteditable="true">${escapeHtml(f.desc)}</div>

      <ol class="list-decimal pl-5 mt-2 space-y-1 text-[15px]" data-field="bullets">
        ${f.bullets.map(b => `<li contenteditable="true">${escapeHtml(b)}</li>`).join("")}
      </ol>

      <div class="not-prose mt-3 flex flex-wrap gap-2">
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-add-bullet" contenteditable="false">+ 성과 추가</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-variant" data-variant="card" contenteditable="false">카드형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-variant" data-variant="text" contenteditable="false">텍스트형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-upload-logo" contenteditable="false">로고</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-add-below" contenteditable="false">아래에 추가</button>
        <button class="border rounded px-2 py-1 text-xs bg-white text-rose-600" data-action="exp-delete" contenteditable="false">삭제</button>
      </div>
    </section>
  `;

  const expRowHtml = (f = defaultExpFields()) => `
    <section class="sc-exp mb-3" data-block="exp" data-variant="text">
      <div class="text-[15px]">
        <strong data-field="company" contenteditable="true">${escapeHtml(f.company)}</strong>
        <span class="text-gray-400 mx-2">|</span>
        <span data-field="period" contenteditable="true">${escapeHtml(f.period)}</span>
        <span class="text-gray-400 mx-2">|</span>
        <span data-field="emp" contenteditable="true">${escapeHtml(f.emp)}</span>
      </div>
      <div class="mt-1"><strong data-field="title" contenteditable="true">${escapeHtml(f.title)}</strong></div>
      <div class="text-sm text-gray-600" data-field="desc" contenteditable="true">${escapeHtml(f.desc)}</div>
      <ol class="list-decimal pl-5 mt-1 space-y-1 text-[15px]" data-field="bullets">
        ${f.bullets.map(b => `<li contenteditable="true">${escapeHtml(b)}</li>`).join("")}
      </ol>
      <div class="not-prose mt-2 flex flex-wrap gap-2">
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-add-bullet" contenteditable="false">+ 성과 추가</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-variant" data-variant="card" contenteditable="false">카드형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-variant" data-variant="text" contenteditable="false">텍스트형</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-upload-logo" contenteditable="false">로고</button>
        <button class="border rounded px-2 py-1 text-xs bg-white" data-action="exp-add-below" contenteditable="false">아래에 추가</button>
        <button class="border rounded px-2 py-1 text-xs bg-white text-rose-600" data-action="exp-delete" contenteditable="false">삭제</button>
      </div>
      <img data-field="logo" src="${f.logo}" alt="" class="hidden" />
    </section>
  `;

  const readExpFields = (wrap: HTMLElement) => {
    const f = defaultExpFields();
    const img = wrap.querySelector("img[data-field='logo']") as HTMLImageElement | null;
    const pick = (q: string, def: string) => {
      const el = wrap.querySelector(`[data-field='${q}']`) as HTMLElement | null;
      return (el?.textContent ?? def).toString().trim() || def;
    };
    const bullets = Array.from(wrap.querySelectorAll('ol[data-field="bullets"] li')).map(li => (li.textContent ?? "").trim()).filter(Boolean);
    return {
      logo: img?.getAttribute("src") || f.logo,
      company: pick("company", f.company),
      title:   pick("title",   f.title),
      period:  pick("period",  f.period),
      emp:     pick("emp",     f.emp),
      desc:    pick("desc",    f.desc),
      bullets: bullets.length ? bullets : f.bullets,
    };
  };

  const switchExpVariant = (wrap: HTMLElement, variant: "card" | "text") => {
    const f = readExpFields(wrap);
    if (variant === "card") wrap.outerHTML = expCardHtml(f);
    else wrap.outerHTML = expRowHtml(f);
  };

  const insertExperienceCard = () => { insertHtmlAtCaret(expCardHtml(), editorRef); afterInsert(); };
  const insertExperienceRow  = () => { insertHtmlAtCaret(expRowHtml(),  editorRef); afterInsert(); };

  /* ---------- ★ 프로젝트 카드/텍스트 ---------- */
  const defaultProjFields = () => ({
    logo: "https://dummyimage.com/72x72/e5e7eb/9ca3af.png&text=P",
    name: "프로젝트명",
    role: "역할/포지션",
    period: "2024.01 - 2024.12",
    stack: ["React", "Next.js", "Prisma"],
    desc: "프로젝트 요약을 입력하세요",
    bullets: ["주요 성과 1", "주요 성과 2", "주요 성과 3"],
    link: "https://example.com"
  });

  const projCardHtml = (f = defaultProjFields()) => `
<section class="sc-proj mb-4 p-3 border rounded-xl bg-white/80 shadow-sm" data-block="proj" data-variant="card">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-3 min-w-0">
      <img data-field="logo" src="${f.logo}" alt="" class="w-9 h-9 rounded object-cover" />
      <div class="min-w-0">
        <div class="font-semibold text-[15px]" data-field="name" contenteditable="true">${escapeHtml(f.name)}</div>
        <div class="text-gray-500 text-xs whitespace-nowrap" data-field="period" contenteditable="true">${escapeHtml(f.period)}</div>
      </div>
    </div>
    <div class="text-xs text-gray-500 whitespace-nowrap">
      <span data-field="role" contenteditable="true">${escapeHtml(f.role)}</span>
    </div>
  </div>

  <div class="mt-2 text-sm text-gray-600" data-field="desc" contenteditable="true">${escapeHtml(f.desc)}</div>

  <div class="sc-chip-list flex flex-wrap gap-2 mt-2">
    ${f.stack.map(s => `<span class="sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm" data-chip="1" contenteditable="true">${escapeHtml(s)}</span>`).join("")}
    <button class="sc-chip-add rounded-full border px-3 py-1 text-sm bg-white/70 hover:bg-white" contenteditable="false" data-action="add-skill">+ 스택</button>
  </div>

  <ol class="list-decimal pl-5 mt-2 space-y-1 text-[15px]" data-field="bullets">
    ${f.bullets.map(b => `<li contenteditable="true">${escapeHtml(b)}</li>`).join("")}
  </ol>

  <div class="mt-2 text-sm">
    <a href="${escapeHtml(f.link)}" target="_blank" rel="noreferrer" data-field="link" contenteditable="true" class="text-blue-600 underline">프로젝트 링크</a>
  </div>

  <div class="not-prose mt-3 flex flex-wrap gap-2">
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-add-bullet" contenteditable="false">+ 성과</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-variant" data-variant="card" contenteditable="false">카드형</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-variant" data-variant="text" contenteditable="false">텍스트형</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-upload-logo" contenteditable="false">로고</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-add-below" contenteditable="false">아래에 추가</button>
    <button class="border rounded px-2 py-1 text-xs bg-white text-rose-600" data-action="proj-delete" contenteditable="false">삭제</button>
  </div>
</section>
`;

  const projRowHtml = (f = defaultProjFields()) => `
<section class="sc-proj mb-3" data-block="proj" data-variant="text">
  <div class="text-[15px]">
    <strong data-field="name" contenteditable="true">${escapeHtml(f.name)}</strong>
    <span class="text-gray-400 mx-2">|</span>
    <span data-field="period" contenteditable="true">${escapeHtml(f.period)}</span>
    <span class="text-gray-400 mx-2">|</span>
    <span data-field="role" contenteditable="true">${escapeHtml(f.role)}</span>
  </div>
  <div class="text-sm text-gray-600 mt-1" data-field="desc" contenteditable="true">${escapeHtml(f.desc)}</div>
  <div class="sc-chip-list flex flex-wrap gap-2 mt-1">
    ${f.stack.map(s => `<span class="sc-chip inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] bg-white" data-chip="1" contenteditable="true">${escapeHtml(s)}</span>`).join("")}
    <button class="sc-chip-add rounded-full border px-3 py-1 text-xs bg-white/70 hover:bg-white" contenteditable="false" data-action="add-skill">+ 스택</button>
  </div>
  <ol class="list-decimal pl-5 mt-1 space-y-1 text-[15px]" data-field="bullets">
    ${f.bullets.map(b => `<li contenteditable="true">${escapeHtml(b)}</li>`).join("")}
  </ol>
  <a href="${escapeHtml(f.link)}" target="_blank" rel="noreferrer" data-field="link" contenteditable="true" class="text-blue-600 underline text-sm mt-1 inline-block">프로젝트 링크</a>
  <div class="not-prose mt-2 flex flex-wrap gap-2">
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-add-bullet" contenteditable="false">+ 성과</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-variant" data-variant="card" contenteditable="false">카드형</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-variant" data-variant="text" contenteditable="false">텍스트형</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-upload-logo" contenteditable="false">로고</button>
    <button class="border rounded px-2 py-1 text-xs bg-white" data-action="proj-add-below" contenteditable="false">아래에 추가</button>
    <button class="border rounded px-2 py-1 text-xs bg-white text-rose-600" data-action="proj-delete" contenteditable="false">삭제</button>
  </div>
  <img data-field="logo" src="${f.logo}" alt="" class="hidden" />
</section>
`;

  const readProjFields = (wrap: HTMLElement) => {
    const f = defaultProjFields();
    const img = wrap.querySelector("img[data-field='logo']") as HTMLImageElement | null;
    const pick = (q: string, def: string) => {
      const el = wrap.querySelector(`[data-field='${q}']`) as HTMLElement | null;
      return (el?.textContent ?? def).toString().trim() || def;
    };
    const bullets = Array.from(wrap.querySelectorAll('ol[data-field="bullets"] li')).map(li => (li.textContent ?? "").trim()).filter(Boolean);
    const stack = Array.from(wrap.querySelectorAll('.sc-chip-list [data-chip="1"]')).map(c => (c.textContent ?? "").trim()).filter(Boolean);
    return {
      logo: img?.getAttribute("src") || f.logo,
      name: pick("name", f.name),
      role: pick("role", f.role),
      period: pick("period", f.period),
      desc: pick("desc", f.desc),
      link: pick("link", f.link),
      bullets: bullets.length ? bullets : f.bullets,
      stack: stack.length ? stack : f.stack,
    };
  };
  const switchProjVariant = (wrap: HTMLElement, variant: "card" | "text") => {
    const f = readProjFields(wrap);
    wrap.outerHTML = (variant === "card") ? projCardHtml(f) : projRowHtml(f);
  };
  const insertProjectCard = () => { insertHtmlAtCaret(projCardHtml(), editorRef); afterInsert(); };
  const insertProjectRow  = () => { insertHtmlAtCaret(projRowHtml(),  editorRef); afterInsert(); };

  /* ---------- ★ KPI 지표 3칸 그리드 ---------- */
  const insertKPIGrid = () => {
    const card = (k="지표", v="+35%", s="설명") => `
      <div class="border rounded-xl p-3 bg-white shadow-sm">
        <div class="text-xs text-gray-500" contenteditable="true">${escapeHtml(k)}</div>
        <div class="text-2xl font-bold leading-none mt-1" contenteditable="true">${escapeHtml(v)}</div>
        <div class="text-xs text-gray-500 mt-1" contenteditable="true">${escapeHtml(s)}</div>
      </div>`;
    insertHtmlAtCaret(`
      <section class="sc-kpi mb-4" data-block="kpi">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${card("전환율", "+12%", "구매 전환")}
          ${card("속도개선", "-35%", "TTI 개선")}
          ${card("사용자", "14만+", "월간")}
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  /* ---------- ★ 수상/자격 칩 ---------- */
  const insertAwardsChips = () => {
    insertHtmlAtCaret(`
      <section class="sc-awards mb-5" data-block="awards">
        <h2 class="text-xl font-semibold mb-2">수상 / 자격</h2>
        <div class="flex flex-wrap gap-2">
          <span class="sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm" data-chip="1" contenteditable="true">정보처리기사 (2024)</span>
          <span class="sc-chip inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white shadow-sm" data-chip="1" contenteditable="true">TOEIC 900 (2023)</span>
          <button class="sc-chip-add rounded-full border px-3 py-1 text-sm bg-white/70 hover:bg-white" contenteditable="false" data-action="add-skill">+ 추가</button>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  /* ---------- ★ 추천사(레퍼런스) 카드 ---------- */
  const insertQuoteCard = () => {
    insertHtmlAtCaret(`
      <section class="sc-quote mb-4" data-block="quote">
        <div class="border rounded-xl p-3 bg-white/80 shadow-sm">
          <div class="flex items-center gap-3">
            <img data-field="avatar" src="https://dummyimage.com/72x72/eaeaea/aaaaaa.png&text=R" class="w-9 h-9 rounded-full object-cover" />
            <div>
              <div class="font-semibold text-[15px]" contenteditable="true" data-field="name">홍길동 팀장</div>
              <div class="text-xs text-gray-500" contenteditable="true" data-field="meta">OO회사 / 전 상사</div>
            </div>
          </div>
          <blockquote class="mt-2 text/[15px] text-gray-700" contenteditable="true" data-field="quote">
“함께 일하며 본 가장 강력한 문제 해결자였습니다. 일정/품질/커뮤니케이션을 모두 잡아냈습니다.”
          </blockquote>
          <div class="not-prose mt-2 flex gap-2">
            <button class="border rounded px-2 py-1 text-xs bg-white" data-action="quote-upload-avatar" contenteditable="false">아바타</button>
            <button class="border rounded px-2 py-1 text-xs bg-white text-rose-600" data-action="quote-delete" contenteditable="false">삭제</button>
          </div>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  /* ---------- ★ 연락처 헤더 ---------- */
  const insertContactHeader = () => {
    insertHtmlAtCaret(`
      <section class="sc-contact mb-5" data-block="contact">
        <div class="border rounded-2xl p-4 bg-white/80 shadow-sm flex items-center gap-4">
          <img data-field="avatar" src="https://dummyimage.com/96x96/dadada/999999.png&text=U" class="w-14 h-14 rounded-full object-cover" />
          <div class="min-w-0">
            <div class="text-2xl font-bold" contenteditable="true" data-field="name">홍길동</div>
            <div class="text-sm text-gray-600" contenteditable="true" data-field="title">Product Manager · 서울</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 mt-1">
              <span contenteditable="true">📧 user@example.com</span>
              <span contenteditable="true">📞 010-0000-0000</span>
              <span contenteditable="true">🔗 github.com/username</span>
              <span contenteditable="true">🕊️ @handle</span>
            </div>
          </div>
          <div class="not-prose ml-auto">
            <button class="border rounded px-2 py-1 text-xs bg-white" data-action="contact-upload-avatar" contenteditable="false">사진</button>
          </div>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  /* ---------- ★ 신규 제안 블록들 (추가) ---------- */
  const insertJDMatrix = () => {
    insertHtmlAtCaret(`
      <section class="my-6 rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-semibold">JD 매칭 매트릭스</h3>
          <span class="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-600">ATS 키워드 합계 <strong>0</strong></span>
        </div>
        <div class="overflow-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500">
                <th class="py-2 pr-3">요구사항</th>
                <th class="py-2 pr-3">내 근거 / 성과 링크</th>
                <th class="py-2">상태</th>
              </tr>
            </thead>
            <tbody class="align-top">
              <tr class="border-t">
                <td class="py-2 pr-3">예) Next.js/Prisma 경험</td>
                <td class="py-2 pr-3">프로젝트 <a class="text-blue-600 underline" href="#">SpecCloud</a> – 문서 에디터/자동저장</td>
                <td class="py-2"><span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-emerald-50 text-emerald-700">✅ 매칭</span></td>
              </tr>
              <tr class="border-t">
                <td class="py-2 pr-3">예) 대규모 트래픽 최적화</td>
                <td class="py-2 pr-3">튜닝 리포트 문서/성능 측정 링크</td>
                <td class="py-2"><span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700">⏳ 보완</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertStarCard = () => {
    insertHtmlAtCaret(`
      <section class="my-6 rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
        <h3 class="font-semibold mb-3">STAR 케이스</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs mb-1">Situation</div>
            <p>상황 설명…</p>
          </div>
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs mb-1">Task</div>
            <p>과제/목표…</p>
          </div>
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs mb-1">Action</div>
            <p>행동(핵심 기술/역량)…</p>
          </div>
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs mb-1">Result</div>
            <p>KPI/성과 수치…</p>
          </div>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertCareerTimeline = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">경력 타임라인</h3>
        <ol class="relative border-l border-gray-300 pl-5">
          <li class="mb-6">
            <div class="absolute -left-[7px] top-0 w-3 h-3 bg-indigo-500 rounded-full"></div>
            <div class="text-sm font-medium">2023.03 → 현재 · 프론트엔드 엔지니어</div>
            <div class="text-sm text-gray-600">SpecCloud – 문서 에디터, AI 보조, PDF</div>
          </li>
          <li class="mb-6">
            <div class="absolute -left-[7px] w-3 h-3 bg-gray-400 rounded-full"></div>
            <div class="text-sm font-medium">2021.07 → 2023.02 · 풀스택 개발자</div>
            <div class="text-sm text-gray-600">프로젝트/성과 요약</div>
          </li>
        </ol>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertSkillBarsSection = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">스킬 숙련도</h3>
        <div class="space-y-3 text-sm">
          ${["TypeScript","Next.js","Prisma","Tailwind CSS"].map(name => `
            <div>
              <div class="flex items-center justify-between">
                <span>${name}</span>
                <span class="text-xs text-gray-500">80%</span>
              </div>
              <div class="h-2 w-full rounded bg-gray-200 overflow-hidden">
                <div class="h-2 bg-indigo-500" style="width:80%"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertPortfolioGallery = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">포트폴리오</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${Array.from({length:3}).map(()=>`
          <article class="border rounded-xl overflow-hidden bg-white shadow-sm">
            <div class="aspect-video bg-gray-100 flex items-center justify-center text-gray-400">이미지</div>
            <div class="p-3">
              <h4 class="font-medium">프로젝트 제목</h4>
              <p class="text-sm text-gray-600">역할 · 핵심기여 · 링크</p>
            </div>
          </article>
          `).join("")}
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertOSSList = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">오픈소스 / 사이드프로젝트</h3>
        <ul class="space-y-2 text-sm">
          <li class="p-3 border rounded-lg bg-white flex items-center justify-between">
            <div>
              <div class="font-medium">repo-name</div>
              <div class="text-gray-600">역할 · 주요 PR/이슈 링크</div>
            </div>
            <div class="text-xs text-gray-500">⭐ 123</div>
          </li>
        </ul>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertTalksPublications = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">발표 · 출판</h3>
        <ul class="list-disc list-inside text-sm text-gray-700">
          <li>2024.11 DevConf – 세션 제목 (슬라이드/영상 링크)</li>
          <li>테크 블로그 – 글 제목 (링크)</li>
        </ul>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertAwardsTimeline = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">수상</h3>
        <div class="flex flex-wrap gap-2">
          <span class="px-2 py-1 rounded-full text-xs bg-gray-100">2025 우수상</span>
          <span class="px-2 py-1 rounded-full text-xs bg-gray-100">2024 대상</span>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertReferencesSimple = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">추천인</h3>
        <ul class="text-sm space-y-1">
          <li>홍길동 · 팀장 · email@example.com · 010-0000-0000</li>
          <li>김영희 · 시니어 · email@example.com · 010-0000-0000</li>
        </ul>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertAvailabilityPrefs = () => {
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-3">가용 시점 & 근무 선호</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs">가용 시점</div>
            <div>즉시(또는 협의)</div>
          </div>
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs">근무 형태</div>
            <div>원격/하이브리드/오피스</div>
          </div>
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs">희망 지역</div>
            <div>서울/성남 …</div>
          </div>
          <div class="p-3 rounded-lg bg-gray-50">
            <div class="text-gray-500 text-xs">희망 연봉</div>
            <div>협의 (범위 기재)</div>
          </div>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertQRPortfolioHeader = () => {
    insertHtmlAtCaret(`
      <header class="my-6 flex items-center justify-between p-4 rounded-xl border bg-white">
        <div>
          <h2 class="text-xl font-bold">이름 (Name)</h2>
          <div class="text-sm text-gray-600">email@example.com · github.com/username · portfolio.site</div>
        </div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=portfolio.site" alt="QR" class="w-24 h-24 rounded-lg border"/>
      </header>
    `, editorRef);
    afterInsert();
  };

  const insertCoverLetterSnippets = () => {
    insertHtmlAtCaret(`
      <section class="my-6 rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
        <h3 class="font-semibold mb-3">커버레터 스니펫</h3>
        <div class="space-y-3 text-sm">
          <div>
            <div class="text-gray-500 text-xs mb-1">지원 동기</div>
            <p>회사/제품에 대한 공감과 문제의식…</p>
          </div>
          <div>
            <div class="text-gray-500 text-xs mb-1">핵심 역량</div>
            <p>직무와 직접 연결된 기술/경험…</p>
          </div>
          <div>
            <div class="text-gray-500 text-xs mb-1">입사 후 90일</div>
            <p>온보딩/로드맵/초기 임팩트 계획…</p>
          </div>
        </div>
      </section>
    `, editorRef);
    afterInsert();
  };

  const insertATSKeywordBank = () => {
    const raw = prompt("콤마(,)로 ATS 키워드를 입력하세요:") || "";
    const keywords = raw.split(",").map(s => s.trim()).filter(Boolean);
    const chips = keywords.map(k => `<span class="px-2 py-1 rounded-full text-xs border bg-gray-50">${escapeHtml(k)}</span>`).join("");
    insertHtmlAtCaret(`
      <section class="my-6">
        <h3 class="font-semibold mb-2">ATS 키워드</h3>
        <div class="flex flex-wrap gap-2">${chips || ""}</div>
      </section>
    `, editorRef);
    afterInsert();
  };

  /* ---------- 템플릿 ---------- */
  const TEMPLATES: QuickTemplate[] = useMemo(() => ([
    { id: "resume-basic", name: "이력서 기본", tags: ["이력서","기본"],
      blocks: [
        { kind: "h", level: 2, text: "프로필" },
        { kind: "kv", labels: ["이름:", "연락처:", "이메일:", "GitHub:"] },
        { kind: "h", level: 2, text: "경력" },
        { kind: "exp-card" },
        { kind: "h", level: 2, text: "기술" },
        { kind: "skills" },
        { kind: "h", level: 2, text: "어학 / 자격" },
        { kind: "lang" },
      ] },
    { id: "resume-dev-senior", name: "이력서 — 개발 경력자", tags: ["이력서","개발","경력"],
      blocks: [
        { kind: "h", level: 2, text: "요약" },
        { kind: "p", text: "React/Next.js 기반 프론트엔드 5년. 페이지 성능 35% 개선, 전환율 12% 향상 등." },
        { kind: "h", level: 2, text: "핵심 스킬" },
        { kind: "skills" },
        { kind: "h", level: 2, text: "경력" },
        { kind: "exp-card" }, { kind: "exp-card" },
        { kind: "h", level: 2, text: "프로젝트" },
        { kind: "ul", items: ["프로젝트 A — 성과/지표", "프로젝트 B — 역할/기여"] },
      ] },
    { id: "resume-junior", name: "이력서 — 신입/주니어", tags: ["이력서","신입","주니어"],
      blocks: [
        { kind: "h", level: 2, text: "학력" },
        { kind: "edu-card" },
        { kind: "h", level: 2, text: "경력/활동" },
        { kind: "exp-row" },
        { kind: "h", level: 2, text: "기술/툴" },
        { kind: "skills" },
      ] },
    { id: "cover-concise", name: "자기소개서 — 간결형", tags: ["자기소개서","간결"],
      blocks: [
        { kind: "h", level: 2, text: "지원 동기" },
        { kind: "p", text: "{{company}}의 {{role}}에 지원한 이유는…" },
        { kind: "h", level: 2, text: "핵심 역량" },
        { kind: "ul", items: ["문제해결", "커뮤니케이션", "주도성"] },
        { kind: "h", level: 2, text: "입사 후 계획" },
        { kind: "p", text: "입사 후 3개월 내…" },
      ] },
    { id: "cover-story", name: "자기소개서 — 스토리형", tags: ["자기소개서","서사"],
      blocks: [
        { kind: "h", level: 2, text: "문제 인식" },
        { kind: "p", text: "과거 프로젝트에서 제가 마주한 가장 큰 문제는…" },
        { kind: "h", level: 2, text: "행동과 선택" },
        { kind: "p", text: "저는 다음과 같은 접근을 택했습니다…" },
        { kind: "h", level: 2, text: "성과와 지표" },
        { kind: "ul", items: ["전환율 +12%", "로드타임 -35%", "팀 커뮤니케이션 개선"] },
        { kind: "h", level: 2, text: "배운 점" },
        { kind: "p", text: "이 경험을 통해 저는…" },
      ] },
  ]), []);

  const applyTemplate = (t: QuickTemplate) => {
    for (const b of t.blocks) {
      if (b.kind === "h") insertHeading(b.text, b.level ?? 2);
      else if (b.kind === "p") insertParagraph(b.text);
      else if (b.kind === "ul") insertBullet(b.items);
      else if (b.kind === "kv") insertKeyValue(b.labels);
      else if (b.kind === "twocol") insertTwoCol(b.items);
      else if (b.kind === "tools") insertToolsTable();
      else if (b.kind === "lang") insertLanguageScoreTable();
      else if (b.kind === "exp") insertExperienceSection();
      else if (b.kind === "edu") insertEducationSection();
      else if (b.kind === "skills") insertSkillSection();
      else if (b.kind === "edu-card") insertEducationCard();
      else if (b.kind === "edu-row") insertEducationRow();
      else if (b.kind === "exp-card") insertExperienceCard();
      else if (b.kind === "exp-row")  insertExperienceRow();
    }
  };

  /* ✅ 프리셋(내 블록 저장/삽입) */
  const [presets, setPresets] = useState<{ id: string; name: string; html: string }[]>([]);
  useEffect(() => {
    try { const raw = localStorage.getItem("spec:presets"); if (raw) setPresets(JSON.parse(raw)); } catch {}
  }, []);
  const persistPresets = useCallback((arr: {id:string;name:string;html:string}[]) => {
    setPresets(arr); try { localStorage.setItem("spec:presets", JSON.stringify(arr)); } catch {}
  }, []);
  const saveSelectionAsPreset = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return alert("선택된 내용이 없습니다.");
    const range = sel.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    const html = container.innerHTML.trim();
    if (!html) return alert("빈 선택입니다.");
    const name = prompt("프리셋 이름:") || `Preset ${presets.length + 1}`;
    const item = { id: crypto.randomUUID(), name, html };
    const next = [...presets, item];
    persistPresets(next);
    alert("프리셋으로 저장했습니다.");
  }, [presets, persistPresets]);
  const insertPreset = useCallback((id: string) => {
    const item = presets.find(p => p.id === id); if (!item) return;
    insertHtmlAtCaret(item.html, editorRef); afterInsert();
  }, [presets]);

  /* ✅ 빠른추가 패널/템플릿 모달 상태 */
  const [quickOpen, setQuickOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  useEffect(() => {
    if (!quickOpen) return;
    const handleClick = (e: MouseEvent) => {
      const container = quickMenuContainerRef.current;
      if (container && !container.contains(e.target as Node)) {
        setQuickOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [quickOpen]);
  const quickActionGroups: QuickActionGroup[] = [
    {
      title: "기본 블록",
      items: [
        {
          key: "heading",
          label: "제목",
          icon: Heading2,
          description: "새 섹션 제목",
          onClick: () => {
            insertHeading("섹션 제목", 2);
            setQuickOpen(false);
          },
        },
        {
          key: "paragraph",
          label: "문단",
          icon: Type,
          description: "일반 텍스트",
          onClick: () => {
            insertParagraph("여기에 내용을 입력하세요.");
            setQuickOpen(false);
          },
        },
        {
          key: "bullet",
          label: "불릿",
          icon: List,
          description: "글머리 목록",
          onClick: () => {
            insertBullet(["항목 1", "항목 2", "항목 3"]);
            setQuickOpen(false);
          },
        },
        {
          key: "two-col",
          label: "2열 표",
          icon: Columns,
          description: "좌우 비교",
          onClick: () => {
            insertTwoCol(["좌측 항목 A", "좌측 항목 B", "우측 항목 A", "우측 항목 B"]);
            setQuickOpen(false);
          },
        },
        {
          key: "profile-kv",
          label: "프로필 표",
          icon: Table,
          description: "Key-Value",
          onClick: () => {
            insertKeyValue(["이름:", "연락처:", "이메일:", "GitHub:"]);
            setQuickOpen(false);
          },
        },
        {
          key: "tools",
          label: "툴 표",
          icon: Wrench,
          description: "툴 숙련도",
          onClick: () => {
            insertToolsTable();
            setQuickOpen(false);
          },
        },
        {
          key: "language",
          label: "어학 표",
          icon: Languages,
          description: "어학/시험",
          onClick: () => {
            insertLanguageScoreTable();
            setQuickOpen(false);
          },
        },
        {
          key: "experience-basic",
          label: "경력(기본)",
          icon: ClipboardList,
          description: "텍스트형 경력",
          onClick: () => {
            insertExperienceSection();
            setQuickOpen(false);
          },
        },
      ],
    },
    {
      title: "핵심 섹션",
      items: [
        {
          key: "skills",
          label: "스킬 칩",
          icon: Sparkles,
          description: "칩 형태로 정리",
          onClick: () => {
            insertSkillSection();
            setQuickOpen(false);
          },
        },
        {
          key: "edu-card",
          label: "학력 카드",
          icon: GraduationCap,
          description: "카드형 학력",
          onClick: () => {
            insertEducationCard();
            setQuickOpen(false);
          },
        },
        {
          key: "edu-row",
          label: "학력 텍스트",
          icon: ScrollText,
          description: "텍스트형 학력",
          onClick: () => {
            insertEducationRow();
            setQuickOpen(false);
          },
        },
        {
          key: "exp-card",
          label: "경력 카드",
          icon: IdCard,
          description: "카드형 경력",
          onClick: () => {
            insertExperienceCard();
            setQuickOpen(false);
          },
        },
        {
          key: "exp-row",
          label: "경력 텍스트",
          icon: ListChecks,
          description: "텍스트형 경력",
          onClick: () => {
            insertExperienceRow();
            setQuickOpen(false);
          },
        },
        {
          key: "proj-card",
          label: "프로젝트 카드",
          icon: KanbanSquare,
          description: "카드형 프로젝트",
          onClick: () => {
            insertProjectCard();
            setQuickOpen(false);
          },
        },
        {
          key: "proj-row",
          label: "프로젝트 텍스트",
          icon: Rows4,
          description: "텍스트형 프로젝트",
          onClick: () => {
            insertProjectRow();
            setQuickOpen(false);
          },
        },
        {
          key: "kpi-grid",
          label: "KPI 그리드",
          icon: BarChart3,
          description: "3칸 성과 그리드",
          onClick: () => {
            insertKPIGrid();
            setQuickOpen(false);
          },
        },
        {
          key: "awards-chip",
          label: "수상 칩",
          icon: Award,
          description: "수상/자격 칩",
          onClick: () => {
            insertAwardsChips();
            setQuickOpen(false);
          },
        },
        {
          key: "quote-card",
          label: "추천사 카드",
          icon: MessageSquareQuote,
          description: "레퍼런스 카드",
          onClick: () => {
            insertQuoteCard();
            setQuickOpen(false);
          },
        },
        {
          key: "contact-header",
          label: "연락처 헤더",
          icon: ContactIcon,
          description: "프로필 헤더",
          onClick: () => {
            insertContactHeader();
            setQuickOpen(false);
          },
        },
      ],
    },
    {
      title: "확장 블록",
      items: [
        {
          key: "jd-matrix",
          label: "JD 매트릭스",
          icon: Grid3x3,
          description: "요구사항 매칭",
          onClick: () => {
            insertJDMatrix();
            setQuickOpen(false);
          },
        },
        {
          key: "star-card",
          label: "STAR 카드",
          icon: Stars,
          description: "STAR 구조",
          onClick: () => {
            insertStarCard();
            setQuickOpen(false);
          },
        },
        {
          key: "career-timeline",
          label: "경력 타임라인",
          icon: History,
          description: "타임라인형",
          onClick: () => {
            insertCareerTimeline();
            setQuickOpen(false);
          },
        },
        {
          key: "skill-bars",
          label: "스킬 바",
          icon: SlidersHorizontal,
          description: "숙련도 막대",
          onClick: () => {
            insertSkillBarsSection();
            setQuickOpen(false);
          },
        },
        {
          key: "portfolio-gallery",
          label: "포트폴리오",
          icon: GalleryHorizontal,
          description: "갤러리 카드",
          onClick: () => {
            insertPortfolioGallery();
            setQuickOpen(false);
          },
        },
        {
          key: "oss-list",
          label: "오픈소스",
          icon: GitFork,
          description: "OSS/사이드",
          onClick: () => {
            insertOSSList();
            setQuickOpen(false);
          },
        },
        {
          key: "talks",
          label: "발표·출판",
          icon: Mic,
          description: "발표/콘텐츠",
          onClick: () => {
            insertTalksPublications();
            setQuickOpen(false);
          },
        },
        {
          key: "awards-timeline",
          label: "수상 타임라인",
          icon: Medal,
          description: "연도별 수상",
          onClick: () => {
            insertAwardsTimeline();
            setQuickOpen(false);
          },
        },
        {
          key: "references",
          label: "추천인",
          icon: UsersRound,
          description: "추천인 정보",
          onClick: () => {
            insertReferencesSimple();
            setQuickOpen(false);
          },
        },
        {
          key: "availability",
          label: "가용/선호",
          icon: CalendarClock,
          description: "근무 선호",
          onClick: () => {
            insertAvailabilityPrefs();
            setQuickOpen(false);
          },
        },
        {
          key: "qr-header",
          label: "QR 헤더",
          icon: QrCode,
          description: "QR 프로필",
          onClick: () => {
            insertQRPortfolioHeader();
            setQuickOpen(false);
          },
        },
        {
          key: "cover-snippets",
          label: "커버레터",
          icon: NotebookPen,
          description: "자기소개서 조각",
          onClick: () => {
            insertCoverLetterSnippets();
            setQuickOpen(false);
          },
        },
        {
          key: "ats-keywords",
          label: "ATS 키워드",
          icon: Hash,
          description: "키워드 뱅크",
          onClick: () => {
            insertATSKeywordBank();
            setQuickOpen(false);
          },
        },
        {
          key: "kpi-badge",
          label: "KPI 배지",
          icon: Target,
          description: "성과 배지",
          onClick: () => {
            const label = prompt("KPI 레이블(예: 전환율):");
            if (!label) return;
            const val = prompt("값/증감(예: +18% YoY):") || "";
            insertHtmlAtCaret(makeKpiBadge(label, val), editorRef);
            afterInsert();
            setQuickOpen(false);
          },
        },
      ],
    },
  ];

  /* 로딩/에러 */
  if (loading) return <div className="p-6 text-gray-500">문서 불러오는 중...</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!doc) return <div className="p-6 text-gray-500">문서를 찾을 수 없습니다。</div>;

  /* UI */
  return (
    <div className="p-0 bg-white">
      {/* 데스크톱: 좌우 2열, 모바일: 1열 */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-col lg:flex-row">
        {/* 좌측(작성) */}
        <div className="min-h-[calc(100vh-64px)] flex-1 min-w-0">
          <div ref={writerPaneRef} className="mx-auto max-w-5xl px-6 lg:px-10 py-8">
            <input
              className="w-full text-3xl font-semibold tracking-tight outline-none border-0 focus:ring-0 placeholder:text-gray-300"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              placeholder="제목을 입력하세요"
            />

            {/* 회사/포지션 */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TagCombobox type="company" value={companyTag} placeholder="지원하는 회사명" onChange={(v) => { setCompanyTag(v); saveMeta("company", v); }} />
              <TagCombobox type="role" value={roleTag} placeholder="포지션" onChange={(v) => { setRoleTag(v); saveMeta("role", v); }} />
            </div>

            {/* 툴바 */}
            <div className="sticky top-2 z-10 mt-4 flex items-center gap-1 flex-wrap bg-white/70 backdrop-blur border rounded-xl px-1 py-1 shadow-sm select-none">
              <div ref={quickMenuContainerRef} className="relative">
                <ToolbarButton
                  className="flex items-center gap-1 font-medium"
                  onClick={() => setQuickOpen((v) => !v)}
                  title="블록/템플릿 빠른 추가"
                >
                  <Plus size={16} strokeWidth={2.2} />
                  <span className="hidden sm:inline">블록 추가</span>
                  <ChevronDown
                    size={14}
                    className={"transition-transform duration-150 " + (quickOpen ? "rotate-180" : "")}
                  />
                </ToolbarButton>
                {quickOpen && (
                  <QuickAddMenu
                    groups={quickActionGroups}
                    presets={presets}
                    onOpenTemplate={() => {
                      setTemplateOpen(true);
                      setQuickOpen(false);
                    }}
                    onSavePreset={saveSelectionAsPreset}
                    onPickPreset={(id) => {
                      insertPreset(id);
                      setQuickOpen(false);
                    }}
                  />
                )}
              </div>
              <ToolbarDivider />
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
                <button disabled={isPending} onClick={() => runRegen("resume")} className="h-8 px-2 text-xs rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50" type="button" title="이력서_초안 AI">
                  {isPending ? "생성 중…" : "이력서 AI 재생성"}
                </button>
                <button disabled={isPending} onClick={() => runRegen("coverletter")} className="h-8 px-2 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50" type="button" title="자기소개서_초안 AI">
                  {isPending ? "생성 중…" : "자기소개서 AI 재생성"}
                </button>
                {regenMsg && <span className="text-[11px] text-gray-500">{regenMsg}</span>}
                <span className={"text-xs px-2 py-1 rounded-md border " + (saveState === "saving" ? "text-amber-600 border-amber-200 bg-amber-50" : saveState === "saved" ? "text-emerald-600 border-emerald-200 bg-emerald-50" : saveState === "error" ? "text-rose-600 border-rose-200 bg-rose-50" : "text-gray-500 border-gray-200 bg-white")}>
                  {saveMsg || "대기"}
                </span>
                <button className="h-8 px-2 text-xs rounded-lg border bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 shadow-sm" onClick={handleDownloadPDF} title="PDF 저장" type="button">⬇️ PDF</button>
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
                         [&_.todo]:list-none [&_.todo>li]:m-0
                         [&_table]:w-full [&_table]:border-collapse
                         [&_th]:border [&_td]:border [&_th]:bg-gray-50 [&_th]:text-left [&_th]:whitespace-nowrap [&_th]:align-top [&_td]:align-top [&_th]:p-2 [&_td]:p-2"
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
              [contenteditable][data-placeholder]:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
            `}</style>

            {/* 이미지 파일 입력(숨김) */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          </div>
        </div>

        {/* 우측 사이드 — AI 패널 */}
        <div className="hidden lg:block w-[360px] shrink-0">
          <div className="sticky top-0 min-h-[100dvh] max-h-[100dvh] overflow-y-auto pr-2 scrollbar-gutter-stable bg-white relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gray-200" />
            <DocAiPanel company={companyTag} role={roleTag} getSelectionHtml={getSelectionHtml} replaceSelection={replaceSelection} />
          </div>
        </div>
      </div>

      {/* ✅ 템플릿 피커 (Portal) */}
      {mounted && templateOpen && createPortal(
        <TemplateModal onClose={() => setTemplateOpen(false)} templates={TEMPLATES} onPick={(t) => { applyTemplate(t); setTemplateOpen(false); }} />,
        document.body
      )}

      {/* 하단 미리보기 배너 */}
      {mounted && bannerCenterX !== null && createPortal(
        <div className="fixed z-[9999]" style={{ left: `${bannerCenterX}px`, transform: "translateX(-50%)", bottom: "112px" }}>
          <button
            onClick={() => { setPreviewHtmlSnap(currentHtml); setPreviewOpen(true); }}
            className="shadow-xl rounded-full border bg-white/90 backdrop-blur px-4 py-2 text-sm flex items-center gap-2 hover:bg-white active:scale-[0.99] transition"
            title="A4 페이지 분할 미리보기"
            type="button"
          >
            미리보기 ▸
          </button>
        </div>,
        document.body
      )}

      {/* 미리보기 모달 */}
      {mounted && previewOpen && createPortal(
        <div className="fixed inset-0 z-[9998]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPreviewOpen(false)} aria-hidden="true" />
          <div className="absolute inset-4 md:inset-8 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-white/70 backdrop-blur">
              <div className="text-sm text-gray-600">A4 미리보기</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPreviewOpen(false)} className="h-8 px-3 text-sm rounded-lg border bg-white hover:bg-gray-50" type="button">닫기 ✕</button>
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
function QuickAddMenu({
  groups,
  presets,
  onOpenTemplate,
  onSavePreset,
  onPickPreset,
}: {
  groups: QuickActionGroup[];
  presets: { id: string; name: string }[];
  onOpenTemplate: () => void;
  onSavePreset: () => void;
  onPickPreset: (id: string) => void;
}) {
  return (
    <div className="absolute right-0 mt-2 w-[360px] max-w-[80vw] rounded-2xl border border-gray-200 bg-white shadow-2xl z-[2000]">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-sm font-semibold text-gray-900">빠른 추가</div>
        <div className="text-xs text-gray-500 mt-1">자주 쓰는 블록을 클릭해서 바로 삽입하세요.</div>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-3 py-3 space-y-4">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 px-1">{group.title}</div>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    className="border border-gray-200 rounded-xl p-2 text-left hover:border-gray-300 hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1"
                    onClick={item.onClick}
                    type="button"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 truncate">{item.label}</span>
                        {item.description && <span className="block text-xs text-gray-500">{item.description}</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <button
            className="flex w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1"
            onClick={onOpenTemplate}
            type="button"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
              <LayoutTemplate size={16} strokeWidth={2} />
            </span>
            <span>템플릿 선택…</span>
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1"
            onClick={onSavePreset}
            type="button"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
              <Save size={16} strokeWidth={2} />
            </span>
            <span>선택 영역을 프리셋으로 저장</span>
          </button>
          {presets.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 px-1">내 프리셋</div>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    className="truncate rounded-xl border border-gray-200 px-3 py-2 text-left text-sm hover:border-gray-300 hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1"
                    onClick={() => onPickPreset(preset.id)}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
function ToolbarDivider() { return <div className="w-px h-6 bg-gray-200 mx-1" />; }

/* ---------- 템플릿 모달 ---------- */
function TemplateModal({ onClose, templates, onPick }: { onClose: () => void; templates: QuickTemplate[]; onPick: (t: QuickTemplate) => void; }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => templates.filter(t => (t.name + " " + (t.tags?.join(" ") ?? "")).toLowerCase().includes(q.toLowerCase())), [templates, q]);
  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center">
      <div className="bg-white w-[820px] max-w-[92vw] rounded-2xl shadow-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <input className="border rounded p-2 flex-1" placeholder="템플릿 검색 (예: 이력서, 자소서, 신입, 경력)" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="border rounded px-3 py-2" onClick={onClose}>닫기</button>
        </div>
        <div className="grid grid-cols-2 gap-3 max-h-[65vh] overflow-auto">
          {list.map(t => (
            <button key={t.id} onClick={() => onPick(t)} className="text-left border rounded-xl p-3 hover:shadow">
              <div className="font-semibold mb-1">{t.name}</div>
              <div className="text-xs text-gray-500">{t.tags?.join(" · ")}</div>
              <div className="text-xs text-gray-400 mt-1">블록 {t.blocks.length}개</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 유틸 ---------- */
function getEditorHtml(ref: React.RefObject<HTMLDivElement>) {
  const root = ref.current;
  if (!root) return "";
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>("[data-editor-ui]").forEach((el) => el.remove());
  clone.querySelectorAll<HTMLElement>("section[data-block][data-sc-enhanced]").forEach((el) => {
    el.removeAttribute("data-sc-enhanced");
  });
  return clone.innerHTML.trim();
}
function setEditorHtml(ref: React.RefObject<HTMLDivElement>, html: string) { if (ref.current) ref.current.innerHTML = html || ""; }
function blockHtml(blocks: Block[]) {
  if (!blocks || blocks.length === 0) return "";
  const doc = (blocks as any[]).find((b) => (b as any).html) as any;
  if (doc?.html) return doc.html;
  const lines = (blocks as any[]).map((b) => (b.text ? escapeHtml(b.text) : "")).join("</p><p>");
  return `<p>${lines}</p>`;
}
function toDocHtml(blocks: Block[]) { return blockHtml(blocks); }
function escapeHtml(str: string) { return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function safeHtml(str: string) { return escapeHtml(str).replace(/\n/g, "<br>"); }
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
