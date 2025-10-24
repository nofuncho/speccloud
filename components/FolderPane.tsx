// components/FolderPane.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import FolderTitleInline from "./FolderTitleInline";

/* ✅ 추가 임포트 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { FolderType } from "@prisma/client";

/* ✅ DocumentCard (⋮ 메뉴 포함) */
import DocumentCard from "./DocumentCard";

/* ---------- 로컬 서버액션 ---------- */
export async function createFolderQuick(fd: FormData) {
  "use server";
  const parentId = String(fd.get("parentId") || "");
  if (!parentId) throw new Error("parentId is required");

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const parent = await prisma.folder.findUnique({
    where: { id: parentId },
    select: { id: true },
  });
  if (!parent) throw new Error("부모 폴더를 찾을 수 없습니다.");

  const baseName = "새 폴더";
  // ❌ before: where: { createdById: userId, parent: { is: { id: parentId } } }
  // ✅ after: parentId 로 직접 필터
  const siblings = await prisma.folder.findMany({
    where: { createdById: userId, parentId },
    select: { name: true },
  });
  const taken = new Set(siblings.map((s) => s.name));

  let counter = 1;
  let candidate = baseName;
  if (taken.has(candidate)) {
    counter = 2;
    while (taken.has(`${baseName} (${counter})`)) counter += 1;
    candidate = `${baseName} (${counter})`;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.folder.create({
        data: {
          name: candidate,
          type: FolderType.CUSTOM,
          // ❌ before: parent / createdBy
          // ✅ after: folder(부모 관계), user(작성자 관계)
          folder: { connect: { id: parentId } },
          user: { connect: { id: userId } },
        },
      });
      revalidatePath("/app");
      return;
    } catch (e: any) {
      if (e?.code === "P2002") {
        counter = Math.max(counter, 2) + 1;
        candidate = `${baseName} (${counter})`;
        continue;
      }
      throw e;
    }
  }

  await prisma.folder.create({
    data: {
      name: `${baseName} (${Date.now() % 100000})`,
      type: FolderType.CUSTOM,
      folder: { connect: { id: parentId } },
      user: { connect: { id: userId } },
    },
  });
  revalidatePath("/app");
}

export async function createDocumentQuick(fd: FormData) {
  "use server";
  const folderId = String(fd.get("folderId") || "");
  const title = String(fd.get("title") || "새 문서");
  if (!folderId) throw new Error("folderId is required");

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true },
  });
  if (!folder) throw new Error("폴더를 찾을 수 없습니다.");

  const initialContent = { type: "doc", version: 1, blocks: [] };

  await prisma.document.create({
    data: {
      title,
      status: "draft",
      content: initialContent,
      folder: { connect: { id: folderId } }, // ✅ OK (문서→폴더 관계명: folder)
      user: { connect: { id: userId } },     // ❌ createdBy → ✅ user (문서→유저 관계명: user)
    },
  });

  revalidatePath("/app");
}

/* ---------- 타입 & 유틸 ---------- */
type DocStatus = "draft" | "final" | "verified";
const STATUS_VALUES = ["draft", "final", "verified"] as const;
const isDocStatus = (v: unknown): v is DocStatus =>
  typeof v === "string" && (STATUS_VALUES as readonly string[]).includes(v);

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

/* ---------- 아이콘 ---------- */
function IconFolder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" fill="currentColor"/>
    </svg>
  );
}
function IconDoc(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor"/>
      <path d="M14 3v5h5" fill="currentColor"/>
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
function IconPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={`block ${props.className ?? ""}`}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

/* ---------- 칩 ---------- */
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

/* ---------- 공용: +카드 ---------- */
function AddCardForm({
  action,
  hidden,
  label,
}: {
  action: (formData: FormData) => Promise<any>;
  hidden: Record<string, string>;
  label: string;
}) {
  return (
    <li className="h-full">
      <form action={action} className="h-full">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} defaultValue={v} />
        ))}
        <button
          type="submit"
          className="group block h-full w-full rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white"
        >
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-zinc-400 group-hover:text-sky-600">
              <IconPlus className="h-7 w-7" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          </div>
        </button>
      </form>
    </li>
  );
}

/* ---------- 본문 ---------- */
export default async function FolderPane({ folderId }: { folderId: string | null }) {
  const safeFolderId = typeof folderId === "string" ? folderId : "";
  if (!safeFolderId) {
    return <div className="p-6 text-sm text-red-600">잘못된 접근입니다. (folderId 없음)</div>;
  }

  const folder = await prisma.folder.findUnique({
    where: { id: safeFolderId },
    select: { id: true, name: true, type: true },
  });
  if (!folder) return <div className="p-6">폴더를 찾을 수 없습니다.</div>;

  const isRootLocked =
    folder.type === "ROOT_COVERLETTER" ||
    folder.type === "ROOT_RESUME" ||
    folder.type === "ROOT_PORTFOLIO";

  const [children, documents] = await Promise.all([
    // ❌ before: where: { parent: { is: { id: safeFolderId } } }
    // ✅ after: parentId 로 간단히 필터
    prisma.folder.findMany({
      where: { parentId: safeFolderId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.document.findMany({
      where: { folderId: safeFolderId },
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
        {/* 헤더 */}
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-[220px] xl:min-w-[260px] flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <IconFolder width={16} height={16} className="opacity-80" />
            </span>
            <FolderTitleInline folderId={safeFolderId} initialName={folder.name} locked={isRootLocked} />
          </div>
          <div className="min-w-0 xl:flex-1" />
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

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-stretch">
            <AddCardForm action={createFolderQuick} hidden={{ parentId: safeFolderId }} label="새 폴더" />

            {children.length === 0 ? (
              <li className="col-span-full rounded-lg border border-dashed border-zinc-200 p-6 text-center text-zinc-400">
                하위 폴더가 없습니다.
              </li>
            ) : (
              children.map((f) => (
                <li key={f.id} className="h-full">
                  <Link
                    href={toApp({ folderId: f.id, docId: null })}
                    className="group block h-full rounded-xl border border-zinc-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-sky-200"
                  >
                    <div className="flex h-full items-center justify-between">
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
              ))
            )}
          </ul>
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

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            <AddCardForm action={createDocumentQuick} hidden={{ folderId: safeFolderId, title: "새 문서" }} label="새 문서" />

            {documents.length === 0 ? (
              <li className="col-span-full rounded-lg border border-dashed border-zinc-200 p-6 text-center text-zinc-400">
                문서가 없습니다. 템플릿으로 생성해보세요.
              </li>
            ) : (
              documents.map((d) => (
                <li key={d.id} className="h-full">
                  <DocumentCard
                    id={d.id}
                    title={d.title ?? "제목 없음"}
                    folderId={d.folderId}
                    href={toApp({ folderId: safeFolderId, docId: d.id })}
                    updatedAt={d.updatedAt}
                    company={d.company}
                    role={d.role}
                    /* 상태칩 제거 위해 넘기지 않아도 됨 */
                    status={null as any}
                  />
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
