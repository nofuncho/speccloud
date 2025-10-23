// components/FolderPane.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import FolderActionsClient from "./FolderPaneClient";
import FolderTitleInline from "./FolderTitleInline";

/* ---------- 타입 & 유틸 ---------- */
type DocStatus = "draft" | "final" | "verified";
const STATUS_VALUES = ["draft", "final", "verified"] as const;
const isDocStatus = (v: unknown): v is DocStatus =>
  typeof v === "string" && (STATUS_VALUES as readonly string[]).includes(v);

const STATUS_LABEL_MAP: Record<DocStatus, string> = {
  draft: "초안",
  final: "최종",
  verified: "검증",
};

const STATUS_CLASS_MAP: Record<DocStatus, string> = {
  draft:
    "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700",
  final:
    "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700",
  verified:
    "inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700",
};

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

function toApp(params: { folderId?: string | null; docId?: string | null }) {
  const sp = new URLSearchParams();
  if (params.folderId) sp.set("folderId", params.folderId);
  if (params.docId) sp.set("docId", params.docId);
  const q = sp.toString();
  return q ? `/app?${q}` : `/app`;
}

/* ---------- 심플 아이콘 ---------- */
function IconFolder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
        fill="currentColor"
      />
    </svg>
  );
}
function IconDoc(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" />
      <path d="M14 3v5h5" fill="currentColor" />
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

/* ---------- 작은 칩 컴포넌트(정렬 확실히 맞춤) ---------- */
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
      {/* 폰트 메트릭 드리프트 보정 */}
      <span className="max-w-[14rem] truncate leading-none translate-y-[0.5px]">{text}</span>
    </span>
  );
}

/* ---------- 본문 ---------- */
export default async function FolderPane({ folderId }: { folderId: string }) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, type: true },
  });
  if (!folder) return <div className="p-6">폴더를 찾을 수 없습니다.</div>;

  const isRootLocked =
    folder.type === "ROOT_COVERLETTER" ||
    folder.type === "ROOT_RESUME" ||
    folder.type === "ROOT_PORTFOLIO";

  const [children, documents] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.document.findMany({
      where: { folderId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        folderId: true,
        company: true,
        role: true,
        status: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* 상단 헤더 */}
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-[220px] xl:min-w-[260px] flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <IconFolder width={16} height={16} className="opacity-80" />
            </span>
            <FolderTitleInline folderId={folderId} initialName={folder.name} locked={isRootLocked} />
          </div>
          <div className="min-w-0 xl:flex-1">
            <FolderActionsClient folderId={folderId} />
          </div>
        </div>

        {/* 하위 폴더 */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100">
                <IconFolder width={12} height={12} className="opacity-80" />
              </span>
              하위 폴더
            </div>
            {children.length > 0 && <div className="text-xs text-zinc-500">{children.length}개</div>}
          </div>

          {children.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-zinc-400">
              하위 폴더가 없습니다.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {children.map((f) => (
                <li key={f.id}>
                  <Link
                    href={toApp({ folderId: f.id, docId: null })}
                    className="group block rounded-xl border border-zinc-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-sky-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
                          <IconFolder width={16} height={16} />
                        </span>
                        <span className="truncate text-sm font-medium text-zinc-800">{f.name ?? "이름 없음"}</span>
                      </div>
                      <IconChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 문서 섹션 */}
        <section className="flex-1 min-h-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100">
                <IconDoc width={12} height={12} className="opacity-80" />
              </span>
              문서
            </div>
            <div className="text-xs text-zinc-500">{documents.length}개</div>
          </div>

          {documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-zinc-400">
              문서가 없습니다. 템플릿으로 생성해보세요.
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {documents.map((d) => {
                const company = d.company ?? "";
                const role = d.role ?? "";
                const raw = (d.status ?? "").toString();
                const hasStatus = raw.length > 0;
                const normalized: DocStatus | null = isDocStatus(raw) ? (raw as DocStatus) : null;

                const statusLabel = normalized ? STATUS_LABEL_MAP[normalized] : "상태 없음";
                const statusClass =
                  normalized
                    ? STATUS_CLASS_MAP[normalized]
                    : "inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700";

                return (
                  <li key={d.id}>
                    <Link
                      href={toApp({ folderId, docId: d.id })}
                      className="group block h-full rounded-xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-200"
                    >
                      {/* 제목 + 상태 */}
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="truncate text-[15px] font-semibold text-zinc-900 group-hover:text-sky-700">
                          {d.title ?? "제목 없음"}
                        </h3>
                        <span className={statusClass}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                          {hasStatus ? statusLabel : "—"}
                        </span>
                      </div>

                      {/* 메타(칩) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {company && (
                          <TagChip
                            icon={<IconBuilding width={12} height={12} className="text-zinc-500" />}
                            text={company}
                          />
                        )}
                        {role && (
                          <TagChip
                            icon={<IconBriefcase width={12} height={12} className="text-zinc-500" />}
                            text={role}
                          />
                        )}
                        {!company && !role && (
                          <span className="inline-flex h-8 items-center rounded-full border border-dashed border-zinc-200 bg-zinc-50 px-3 text-[12px] text-zinc-400 leading-none">
                            태그 추가
                          </span>
                        )}
                      </div>

                      {/* 수정일 */}
                      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                        <span>수정일 {formatDateSafe(d.updatedAt)}</span>
                        <IconChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
