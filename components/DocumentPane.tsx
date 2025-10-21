"use client";

import type React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  FileSignature,
  LayoutTemplate,
  HelpCircle,
  Palette,
  FileStack,
} from "lucide-react";

import {
  renameDocument,
  saveDocumentJson,
} from "@/app/actions/folderActions";

type Block =
  | { type: "doc"; html: string }
  | { type: string; text?: string; html?: string };

type Doc = {
  id: string;
  title: string;
  content: { blocks: Block[] } | null;
  templateKey?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type TemplateOption = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  html: string;
};

type TemplateGroup = {
  category: string;
  icon: LucideIcon;
  toneClass: string;
  templates: TemplateOption[];
};

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    category: "Resume",
    icon: Briefcase,
    toneClass: "bg-sky-100 text-sky-700",
    templates: [
      {
        key: "resume_classic",
        label: "Classic Resume",
        description: "Summary, experience, education, skills.",
        icon: LayoutTemplate,
        html: `
          <section>
            <h2>Professional Summary</h2>
            <p><strong>조동현</strong> | Product Manager | jodonghyun@example.com | 010-5291-8332</p>
            <p>고객 여정 개선과 데이터 기반 실험을 통해 SaaS 제품의 전환율을 높여 온 5년 차 프로덕트 매니저입니다.</p>
          </section>
          <section>
            <h2>Experience</h2>
            <article>
              <h3>스펙클라우드 | Product Manager <span>(2022.03 - 현재)</span></h3>
              <ul>
                <li>온보딩 플로우 개편으로 무료 체험 전환율을 28%에서 41%로 향상.</li>
                <li>성과 지표 대시보드를 설계해 세일즈 리포트 작성 시간을 60% 단축.</li>
              </ul>
            </article>
          </section>
          <section>
            <h2>Education</h2>
            <p><strong>포항공과대학교</strong> | 산업공학과 (2017)</p>
          </section>
        `.trim(),
      },
      {
        key: "resume_modern",
        label: "Modern Resume",
        description: "Concise resume with metrics.",
        icon: LayoutTemplate,
        html: `
          <header>
            <h1>조동현</h1>
            <p>Product Manager | 서울 | jodonghyun@example.com | 010-5291-8332</p>
          </header>
          <section>
            <h2>Snapshot</h2>
            <ul>
              <li>연간 ARR 120억 규모 SaaS 제품 로드맵 총괄.</li>
              <li>사용자 인터뷰 120회 이상 진행하며 핵심 페인포인트 도출.</li>
            </ul>
          </section>
          <section>
            <h2>Recent Experience</h2>
            <p>스펙클라우드에서 AI 문서 자동화 기능을 출시해 월간 활성 사용자를 35% 성장시켰습니다. 마케팅, 세일즈, 엔지니어링과 협업해 시장 요구를 제품 전략에 반영했습니다.</p>
          </section>
        `.trim(),
      },
    ],
  },
  {
    category: "Cover Letter",
    icon: FileSignature,
    toneClass: "bg-rose-100 text-rose-700",
    templates: [
      {
        key: "cover_story",
        label: "Narrative Cover Letter",
        description: "STAR style story.",
        icon: FileSignature,
        html: `
          <section>
            <p>Dear 김채용 매니저님,</p>
            <p>안녕하세요. 스펙클라우드 Product Manager 포지션에 지원하는 조동현입니다. 고객 문제를 해결하는 실험을 즐기는 사람으로서 귀사의 AI 전략에 기여하고 싶습니다.</p>
          </section>
          <section>
            <h2>STAR Story</h2>
            <p><strong>Situation</strong> 주요 고객들이 온보딩 과정에서 이탈하는 문제가 있었습니다.</p>
            <p><strong>Task</strong> 30일 내 전환율을 10% 이상 끌어올리는 목표를 맡았습니다.</p>
            <p><strong>Action</strong> 사용자 인터뷰와 퍼널 분석을 통해 장애 요소를 확인하고, 맞춤형 튜토리얼과 자동 알림을 도입했습니다.</p>
            <p><strong>Result</strong> 도입 후 6주 만에 전환율이 13%p 상승하고 NPS가 9점 향상되었습니다.</p>
          </section>
          <section>
            <h2>Closing</h2>
            <p>이 경험을 바탕으로 스펙클라우드의 AI 문서 자동화 제품도 빠르게 성장시키겠습니다. 기회가 된다면 직접 이야기 나누고 싶습니다.</p>
          </section>
        `.trim(),
      },
      {
        key: "cover_qna",
        label: "Q&A Cover Letter",
        description: "Answer common prompts.",
        icon: HelpCircle,
        html: `
          <section>
            <h2>1. Motivation</h2>
            <p>스펙클라우드는 생성형 AI와 문서 자동화의 결합으로 B2B 시장에서 독보적 기회를 만들고 있다고 믿습니다. 고객의 일을 더 쉽게 만들겠다는 미션에 깊이 공감합니다.</p>
          </section>
          <section>
            <h2>2. Strength</h2>
            <p>데이터 기반 실험 설계와 크로스 펑셔널 협업이 강점입니다. 제품, 디자인, 세일즈를 조율하며 의사결정을 빠르게 이끌었습니다.</p>
          </section>
          <section>
            <h2>3. Collaboration</h2>
            <p>최근 AI 추천 모델 고도화 프로젝트에서 엔지니어 4명, 디자이너 1명과 함께 8주간 스프린트를 운영했습니다. 매주 고객 피드백을 반영하며 로드맵을 조정했습니다.</p>
          </section>
          <section>
            <h2>4. Plan</h2>
            <p>입사 후 첫 분기에는 핵심 퍼널 데이터 계측을 정비하고, 상위 고객군을 위한 맞춤 템플릿을 도입해 활성도를 끌어올릴 계획입니다.</p>
          </section>
        `.trim(),
      },
    ],
  },
  {
    category: "Portfolio",
    icon: Palette,
    toneClass: "bg-indigo-100 text-indigo-700",
    templates: [
      {
        key: "portfolio_design",
        label: "Design Case Study",
        description: "Problem, process, outcome.",
        icon: Palette,
        html: `
          <section>
            <h2>Overview</h2>
            <p>스펙클라우드 온보딩 경험을 재설계하여 새 고객의 첫 주차 활성 지표를 개선한 프로젝트입니다.</p>
          </section>
          <section>
            <h2>Process</h2>
            <ul>
              <li>정성 인터뷰 20회와 행동 데이터 분석으로 문제 정의.</li>
              <li>핵심 시나리오를 스토리보드로 시각화하고 저충실도 프로토타입을 반복 검증.</li>
              <li>디자인 시스템을 정리하고 개발 협업을 통해 단계별 출시.</li>
            </ul>
          </section>
          <section>
            <h2>Outcome</h2>
            <p>출시 4주 후 온보딩 완료율이 45%에서 68%로 상승하고, 지원 요청 티켓이 30% 감소했습니다.</p>
          </section>
        `.trim(),
      },
      {
        key: "portfolio_dev",
        label: "Engineering Portfolio",
        description: "Focus on stack and impact.",
        icon: LayoutTemplate,
        html: `
          <section>
            <h2>Introduction</h2>
            <p>안녕하세요, 조동현입니다. 클라우드 문서 자동화와 데이터 파이프라인을 설계하는 제품 개발자입니다.</p>
          </section>
          <section>
            <h2>Highlighted Project</h2>
            <p>스펙클라우드 문서 생성 엔진을 설계하며 Next.js, Prisma, Vertex AI를 활용해 템플릿 기반 생성 시간을 70% 단축했습니다.</p>
          </section>
          <section>
            <h2>Technical Stack</h2>
            <p>TypeScript, Next.js, React Query, Prisma, PostgreSQL, AWS Lambda, Vertex AI, GitHub Actions 등 협업 환경에 익숙합니다.</p>
          </section>
        `.trim(),
      },
    ],
  },
];

const TEMPLATE_MAP: Record<string, TemplateOption> = TEMPLATE_GROUPS.reduce(
  (acc, group) => {
    group.templates.forEach((tpl) => {
      acc[tpl.key] = tpl;
    });
    return acc;
  },
  {} as Record<string, TemplateOption>,
);

export default function DocumentPane({ docId }: { docId: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState("");

  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipEditorSyncRef = useRef(false);

  const fieldsRef = useRef<Record<string, string>>({});
  const lastSavedHtmlRef = useRef("");
  const lastSavedTitleRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [templateSearch, setTemplateSearch] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const currentHtml = useMemo(() => blockHtml(blocks), [blocks]);
  const placeholderKeys = useMemo(() => extractTemplateKeys(currentHtml), [currentHtml]);
  const filteredGroups = useMemo(() => {
    const term = templateSearch.trim().toLowerCase();
    if (!term) return TEMPLATE_GROUPS;
    return TEMPLATE_GROUPS
      .map((group) => ({
        ...group,
        templates: group.templates.filter((tpl) => {
          const haystack = `${tpl.label} ${tpl.description} ${tpl.key}`.toLowerCase();
          return haystack.includes(term);
        }),
      }))
      .filter((group) => group.templates.length > 0);
  }, [templateSearch]);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    let alive = true;
    async function loadDocument() {
      if (!docId) {
        setError("문서 ID가 없습니다.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/documents?id=${encodeURIComponent(docId)}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`문서를 불러오지 못했습니다. (HTTP ${res.status})`);
        }
        const data: Doc = await res.json();
        if (!alive) return;
        setDoc(data);
        setTitle(data?.title ?? "");
        const rawBlocks = data?.content?.blocks ?? [];
        const html = toDocHtml(rawBlocks);
        lastSavedHtmlRef.current = html;
        lastSavedTitleRef.current = data?.title ?? "";
        setBlocks([{ type: "doc", html }]);
        const nextFields: Record<string, string> = {};
        extractTemplateKeys(html).forEach((key) => {
          nextFields[key] = fieldsRef.current[key] ?? "";
        });
        fieldsRef.current = nextFields;
        setFields(nextFields);
        setActiveTemplate(data?.templateKey ?? null);
      } catch (err) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : "문서를 불러오는 중 오류가 발생했습니다.";
        setError(message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadDocument();
    return () => {
      alive = false;
    };
  }, [docId]);

  useEffect(() => {
    if (placeholderKeys.length === 0) {
      if (Object.keys(fieldsRef.current).length > 0) {
        fieldsRef.current = {};
        setFields({});
      }
      return;
    }
    setFields((prev) => {
      const next: Record<string, string> = {};
      placeholderKeys.forEach((key) => {
        next[key] = prev[key] ?? "";
      });
      fieldsRef.current = next;
      return next;
    });
  }, [placeholderKeys]);

  useEffect(() => {
    if (skipEditorSyncRef.current) {
      skipEditorSyncRef.current = false;
      return;
    }
    const html = currentHtml;
    setEditorHtml(editorRef, html);
  }, [currentHtml]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
  }, []);

  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }, []);

  const insertTodo = useCallback(() => {
    const html = `
      <ul class="todo my-1">
        <li data-checked="false">
          <input type="checkbox" class="mt-1" />
          <div class="todo-text">Add a checklist item</div>
        </li>
      </ul>
    `;
    insertHtmlAtCaret(html, editorRef);
    syncBlocksFromEditor(editorRef, setBlocks);
  }, []);

  const insertLink = useCallback(() => {
    const url = prompt("Enter link URL (e.g. https://example.com)");
    if (!url) return;
    exec("createLink", url);
  }, [exec]);

  const insertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onPickImage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const html = `<img src="${src}" alt="" class="my-2 max-w-full rounded-md shadow-sm" />`;
      insertHtmlAtCaret(html, editorRef);
      syncBlocksFromEditor(editorRef, setBlocks);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }, []);

  const saveTitle = useCallback(async () => {
    if (!doc) return;
    const next = title.trim() || "제목 없음";
    if (next !== lastSavedTitleRef.current) {
      await renameDocument(doc.id, next);
      lastSavedTitleRef.current = next;
    }
  }, [doc, title]);

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
        const nextTitle = titleTrim || "제목 없음";
        await renameDocument(doc.id, nextTitle);
        lastSavedTitleRef.current = nextTitle;
      }
      setSaveState("saved");
      setSaveMsg("저장됨");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (err) {
      console.error(err);
      setSaveState("error");
      setSaveMsg("저장 실패");
    }
  }, [doc, title]);

  useEffect(() => {
    if (!doc) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    setSaveState("saving");
    setSaveMsg("저장 대기…");
    saveTimerRef.current = setTimeout(() => {
      void saveNow();
    }, 800);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [blocks, title, doc, saveNow]);

  const handleEditorInput = useCallback(() => {
    skipEditorSyncRef.current = true;
    syncBlocksFromEditor(editorRef, setBlocks);
  }, []);

  const handleEditorClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
      const li = target.closest("li");
      if (li) {
        const checked = (target as HTMLInputElement).checked;
        li.setAttribute("data-checked", checked ? "true" : "false");
        syncBlocksFromEditor(editorRef, setBlocks);
      }
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      exec("bold");
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
      event.preventDefault();
      exec("italic");
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u") {
      event.preventDefault();
      exec("underline");
    }
  }, [exec, saveNow]);

  const handleTemplateField = useCallback((key: string, value: string) => {
    const next = { ...fieldsRef.current, [key]: value };
    fieldsRef.current = next;
    setFields(next);
    const html = replaceTemplateFields(currentHtml, next);
    skipEditorSyncRef.current = true;
    setBlocks([{ type: "doc", html }]);
    setEditorHtml(editorRef, html);
  }, [currentHtml]);

  const handleApplyTemplate = useCallback((tpl: TemplateOption) => {
    const html = tpl.html.trim();
    skipEditorSyncRef.current = true;
    setBlocks([{ type: "doc", html }]);
    setEditorHtml(editorRef, html);
    const nextFields: Record<string, string> = {};
    extractTemplateKeys(html).forEach((key) => {
      nextFields[key] = "";
    });
    fieldsRef.current = nextFields;
    setFields(nextFields);
    setActiveTemplate(tpl.key);
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-500">문서 불러오는 중...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!doc) {
    return <div className="p-6 text-gray-500">문서를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="grid h-full w-full grid-cols-1 gap-6 bg-white md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div className="min-h-[calc(100vh-64px)] border-r border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          <input
            className="w-full border-0 text-3xl font-semibold tracking-tight outline-none placeholder:text-gray-300 focus:ring-0"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            placeholder="제목을 입력하세요"
          />

          <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border bg-white/80 px-1 py-1 shadow-sm">
            <ToolbarButton onClick={() => exec("bold")} title="굵게 (Ctrl/⌘+B)">B</ToolbarButton>
            <ToolbarButton onClick={() => exec("italic")} title="기울임 (Ctrl/⌘+I)">I</ToolbarButton>
            <ToolbarButton onClick={() => exec("underline")} title="밑줄 (Ctrl/⌘+U)">U</ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton onClick={() => exec("formatBlock", "h1")} title="제목 1">H1</ToolbarButton>
            <ToolbarButton onClick={() => exec("formatBlock", "h2")} title="제목 2">H2</ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton onClick={() => exec("insertUnorderedList")} title="글머리 목록">•</ToolbarButton>
            <ToolbarButton onClick={() => exec("insertOrderedList")} title="번호 목록">1.</ToolbarButton>
            <ToolbarButton onClick={insertTodo} title="체크박스">☑︎</ToolbarButton>
            <ToolbarButton onClick={insertLink} title="링크 삽입">🔗</ToolbarButton>
            <ToolbarButton onClick={insertImage} title="이미지 삽입">🖼</ToolbarButton>
            <div className="ml-auto flex items-center gap-2 pr-1">
              <span
                className={
                  "rounded-md border px-2 py-1 text-xs " +
                  (saveState === "saving"
                    ? "border-amber-200 bg-amber-50 text-amber-600"
                    : saveState === "saved"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                      : saveState === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-600"
                        : "border-gray-200 bg-white text-gray-500")
                }
              >
                {saveMsg || "대기"}
              </span>
              <button
                className="h-8 rounded-lg border bg-white px-2 text-xs text-gray-700 shadow-sm"
                onClick={saveNow}
                type="button"
              >
                저장
              </button>
            </div>
          </div>

          <div
            ref={editorRef}
            className="mt-4 min-h-[58vh] rounded-xl bg-white p-5 outline-none
                       prose prose-neutral max-w-none
                       [&_p]:my-2 [&_h1]:text-3xl [&_h1]:font-semibold
                       [&_h2]:text-2xl [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200
                       [&_blockquote]:pl-4 [&_blockquote]:text-gray-600
                       [&_pre]:rounded-lg [&_pre]:bg-gray-50 [&_pre]:p-3
                       [&_.todo]:list-none"
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            onClick={handleEditorClick}
            aria-label="문서 에디터"
            data-placeholder="여기에 내용을 입력하세요…"
          />

          <style jsx>{`
            [contenteditable][data-placeholder]:empty:before {
              content: attr(data-placeholder);
              color: #9ca3af;
              pointer-events: none;
            }
          `}</style>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickImage}
          />
        </div>
      </div>

      <div className="min-h-[calc(100vh-64px)] bg-gray-50">
        <div className="px-6 py-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">템플릿 탐색</div>
            <button
              type="button"
              onClick={() => setTemplateSearch("")}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500"
            >
              <FileStack className="h-3 w-3" /> 초기화
            </button>
          </div>

          <input
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
            className="mb-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
            placeholder="템플릿 검색"
          />

          <div className="space-y-6">
            {filteredGroups.map((group) => (
              <div key={group.category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${group.toneClass}`}>
                    <group.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold text-gray-700">{group.category}</div>
                </div>
                <div className="space-y-2">
                  {group.templates.map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => handleApplyTemplate(tpl)}
                      className={
                        "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition " +
                        (activeTemplate === tpl.key
                          ? "border-sky-300 bg-sky-50"
                          : "border-gray-200 bg-white hover:border-sky-200 hover:bg-sky-50/60")
                      }
                    >
                      <div className="mt-1 rounded-md bg-gray-100 p-2 text-gray-600">
                        <tpl.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-sm font-medium text-gray-700">{tpl.label}</div>
                        <p className="text-xs text-gray-500">{tpl.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {placeholderKeys.length > 0 && (
            <div className="mt-8 space-y-3">
              <div className="text-sm font-semibold text-gray-700">템플릿 변수</div>
              <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
                {placeholderKeys.map((key) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">{`{{${key}}}`}</label>
                    <input
                      value={fields[key] ?? ""}
                      onChange={(event) => handleTemplateField(key, event.target.value)}
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                      placeholder="입력값이 본문에 반영됩니다."
                    />
                  </div>
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
        "inline-flex h-8 items-center justify-center gap-1 rounded-lg border bg-white px-2 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 active:bg-gray-100 " +
        className
      }
      type="button"
      {...rest}
    />
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-gray-200" />;
}

function escapeHtml(str: string) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function blockHtml(blocks: Block[]) {
  if (!blocks || blocks.length === 0) return "";
  const docBlock = blocks.find((b) => (b as any).html) as Block | undefined;
  if (docBlock && "html" in docBlock && docBlock.html) return docBlock.html;
  const lines = blocks
    .map((b) => ((b as any).text ? escapeHtml((b as any).text) : ""))
    .join("</p><p>");
  return `<p>${lines}</p>`;
}

function toDocHtml(blocks: Block[]) {
  return blockHtml(blocks);
}

function getEditorHtml(ref: React.RefObject<HTMLDivElement>) {
  return (ref.current?.innerHTML || "").trim();
}

function setEditorHtml(ref: React.RefObject<HTMLDivElement>, html: string) {
  const element = ref.current;
  if (!element) return;
  const next = html || "";
  if (element.innerHTML === next) return;
  const shouldRestoreSelection = typeof document !== "undefined" && document.activeElement === element;
  element.innerHTML = next;
  if (shouldRestoreSelection && typeof window !== "undefined") {
    const selection = window.getSelection();
    if (selection) {
      selection.selectAllChildren(element);
      selection.collapseToEnd();
    }
  }
}

function extractTemplateKeys(html: string) {
  const keys = new Set<string>();
  const regex = /{{(.*?)}}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return Array.from(keys);
}

function insertHtmlAtCaret(html: string, editorRef: React.RefObject<HTMLDivElement>) {
  editorRef.current?.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node: ChildNode | null;
  while ((node = temp.firstChild)) {
    frag.appendChild(node);
  }
  range.insertNode(frag);
  sel.collapseToEnd();
}

function syncBlocksFromEditor(
  editorRef: React.RefObject<HTMLDivElement>,
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>,
) {
  const html = getEditorHtml(editorRef);
  setBlocks([{ type: "doc", html }]);
}

function replaceTemplateFields(html: string, map: Record<string, string>) {
  return html.replace(/{{(.*?)}}/g, (match, rawKey) => {
    const key = String(rawKey ?? "").trim();
    const value = map[key];
    if (value === undefined || value.trim() === "") {
      return match;
    }
    return escapeHtml(value).replace(/\n/g, "<br>");
  });
}
