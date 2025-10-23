"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { duplicateDocumentAction, deleteDocumentAction } from "@/app/actions/documentActions";

function formatDateSafe(date: unknown) {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date as any);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
}

function IconBuilding(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M3 21V6l7-3 7 3v15h-4v-5H7v5H3Z" fill="currentColor" />
    </svg>
  );
}
function IconBriefcase(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Zm2-1h2v1h-2V5Z" fill="currentColor" />
    </svg>
  );
}
function IconChevronRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function TagChip({
  icon,
  text,
  className = "",
}: {
  icon: React.ReactNode;
  text: string;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 h-8 px-3 rounded-full " +
        "border border-zinc-200 bg-zinc-50 text-[12px] font-medium text-zinc-700 " +
        "ring-1 ring-inset ring-white/50 leading-none " +
        className
      }
      title={text}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200">
        <span className="block">{icon}</span>
      </span>
      <span className="max-w-[14rem] truncate leading-none translate-y-[0.5px]">{text}</span>
    </span>
  );
}

export default function DocumentCard(props: {
  id: string;
  title: string;
  folderId: string | null;
  href: string;
  updatedAt?: unknown;
  company?: string | null;
  role?: string | null;
}) {
  const { id, title, href, updatedAt, company, role } = props;

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  /** 외부 클릭 시 메뉴 닫기 */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const onDuplicate = async () => {
    setOpen(false);
    await duplicateDocumentAction(id);
    router.refresh();
  };

  const onDelete = async () => {
    setOpen(false);
    if (!confirm("이 문서를 삭제할까요? 복구할 수 없습니다.")) return;
    await deleteDocumentAction(id);
    router.refresh();
  };

  const onDownload = () => {
  setOpen(false);
  // ✅ 기본을 PDF로
  window.location.href = `/api/documents/${id}/download?type=pdf`;
    };

  /** 카드 전체 클릭 → 문서 열기 */
  const handleCardClick = () => {
    if (!open) router.push(href);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative isolate ${open ? "z-50" : ""} cursor-pointer h-full rounded-xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-200`}
        >
      {/* 상단: 제목 + kebab */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-[15px] font-semibold text-zinc-900 group-hover:text-sky-700">
          {title || "제목 없음"}
        </h3>

        <div className="relative" ref={ref}>
          <button
            type="button"
            aria-label="문서 옵션"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation(); // 클릭 버블링 차단
              setOpen((v) => !v);
            }}
          >
            <span className="text-xl leading-none">⋮</span>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg z-50">
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onClick={onDuplicate}
              >
                사본 만들기
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onClick={onDownload}
              >
                다운로드
              </button>
              <div className="my-1 h-px bg-gray-100" />
              <button
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={onDelete}
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 메타(칩) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {company ? (
          <TagChip
            icon={<IconBuilding width={12} height={12} className="text-zinc-500" />}
            text={company}
          />
        ) : null}
        {role ? (
          <TagChip
            icon={<IconBriefcase width={12} height={12} className="text-zinc-500" />}
            text={role}
          />
        ) : null}
        {!company && !role ? (
          <span className="inline-flex h-8 items-center rounded-full border border-dashed border-zinc-200 bg-zinc-50 px-3 text-[12px] text-zinc-400 leading-none">
            태그 추가
          </span>
        ) : null}
      </div>

      {/* 하단: 수정일 + 화살표 */}
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>수정일 {formatDateSafe(updatedAt)}</span>
        <span className="inline-flex items-center">
          <IconChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
        </span>
      </div>
    </div>
  );
}
