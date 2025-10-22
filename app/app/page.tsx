// app/app/page.tsx
import { getServerSession } from "next-auth";

import DocumentPane from "@/components/DocumentPane";
import FolderPane from "@/components/FolderPane";
import SidebarTree from "@/components/SidebarTree";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SearchParams = { folderId?: string; docId?: string };

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const roots = userId
    ? await prisma.folder.findMany({
        where: { parentId: null, createdById: userId },
        orderBy: { name: "asc" },
      })
    : [];

  const activeFolderId = searchParams.folderId ?? roots[0]?.id ?? null;
  const activeDocId = searchParams.docId ?? null;

  return (
    <main
      className="grid min-h-screen w-full overflow-x-hidden" // 가로 스크롤 전역 차단
      style={{
        gridTemplateColumns: "280px minmax(320px, 0.8fr) minmax(640px, 1.6fr)", // 사이드바 280px로 통일
        gridTemplateRows: "1fr",
      }}
    >
      {/* 사이드바: 내부 스크롤 금지 */}
      <aside className="border-r border-zinc-200 bg-white overflow-hidden">
        <SidebarTree roots={roots} activeFolderId={activeFolderId} />
      </aside>

      {/* 폴더 패널: 본문 영역은 반드시 min-w-0 */}
      <section className="min-w-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50">
        {activeFolderId ? (
          <FolderPane folderId={activeFolderId} />
        ) : roots.length === 0 ? (
          <EmptyState title="루트 폴더가 없습니다. 먼저 폴더를 만들어 주세요." />
        ) : (
          <EmptyState title="폴더를 선택해 주세요." />
        )}
      </section>

      {/* 문서 패널 */}
      <section className="min-w-0 overflow-y-auto bg-white">
        {activeDocId ? (
          <DocumentPane docId={activeDocId} />
        ) : (
          <EmptyState title="문서를 선택하거나 새 문서를 만들어 보세요." />
        )}
      </section>
    </main>
  );
}

function EmptyState({ title }: { title: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-zinc-500">{title}</div>;
}
