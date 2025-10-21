// components/FolderPane.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import FolderActionsClient from "./FolderPaneClient";
import FolderTitleInline from "./FolderTitleInline"; // ✅ 추가: 인라인 제목 편집 컴포넌트

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
    "inline-block text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700",
  final:
    "inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700",
  verified:
    "inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700",
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

// /app 경로용 쿼리 URL 생성기
function toApp(params: { folderId?: string | null; docId?: string | null }) {
  const sp = new URLSearchParams();
  if (params.folderId) sp.set("folderId", params.folderId);
  if (params.docId) sp.set("docId", params.docId);
  const q = sp.toString();
  return q ? `/app?${q}` : `/app`;
}

export default async function FolderPane({ folderId }: { folderId: string }) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    // ✅ type까지 함께 조회해서 루트 폴더 잠금 판단
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
        status: true, // string|null
      },
    }),
  ]);

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto bg-zinc-50">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4 xl:pb-2">
        <div className="min-w-[220px] xl:min-w-[260px]">
          <FolderTitleInline
            folderId={folderId}
            initialName={folder.name}
            locked={isRootLocked}
          />
        </div>

        <div className="min-w-0 xl:flex-1">
          <FolderActionsClient folderId={folderId} />
        </div>
      </div>

      <section>
        <div className="text-sm font-medium text-zinc-600 mb-2">하위 폴더</div>
        {children.length === 0 ? (
          <div className="text-zinc-400 text-sm">하위 폴더가 없습니다.</div>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {children.map((f) => (
              <li key={f.id}>
                {/* 하위 폴더로 이동할 때는 docId는 초기화 */}
                <Link
                  href={toApp({ folderId: f.id, docId: null })}
                  className="block border border-zinc-200 rounded-md p-3 bg-white hover:bg-zinc-50 transition"
                >
                  📁 {f.name ?? "이름 없음"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex-1 min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-zinc-600">문서</div>
          <div className="text-xs text-zinc-500">{documents.length}개</div>
        </div>

        {documents.length === 0 ? (
          <div className="text-zinc-400 text-sm">
            문서가 없습니다. 템플릿으로 생성해보세요.
          </div>
        ) : (
          <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2">제목</th>
                  <th className="text-left font-medium px-2 py-2">회사</th>
                  <th className="text-left font-medium px-2 py-2">직무</th>
                  <th className="text-left font-medium px-2 py-2">상태</th>
                  <th className="text-left font-medium px-2 py-2">수정일</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const company = d.company ?? "—";
                  const role = d.role ?? "—";
                  const raw = (d.status ?? "").toString();
                  const hasStatus = raw.length > 0;
                  const normalized: DocStatus | null = isDocStatus(raw)
                    ? (raw as DocStatus)
                    : null;

                  const statusLabel = normalized
                    ? STATUS_LABEL_MAP[normalized]
                    : "—";
                  const statusClass = normalized
                    ? STATUS_CLASS_MAP[normalized]
                    : "inline-block text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600";

                  return (
                    <tr
                      key={d.id}
                      className="border-t border-zinc-100 hover:bg-zinc-50 transition"
                    >
                      <td className="px-3 py-2">
                        {/* 같은 폴더 유지 + 해당 문서 열기 */}
                        <Link
                          href={toApp({ folderId, docId: d.id })}
                          className="text-sky-700 hover:underline"
                        >
                          <span className="mr-1">✍️</span>
                          {d.title ?? "제목 없음"}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{company}</td>
                      <td className="px-2 py-2">{role}</td>
                      <td className="px-2 py-2">
                        {hasStatus ? (
                          <span className={statusClass}>{statusLabel}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-zinc-500">
                        {formatDateSafe(d.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
