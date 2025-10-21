// app/app/page.tsx
import { getServerSession } from "next-auth";

import DocumentPane from "@/components/DocumentPane";
import FolderPane from "@/components/FolderPane";
import SidebarTree from "@/components/SidebarTree";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
type SearchParams = {
  folderId?: string;
  docId?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-600">
        로그인이 필요합니다.
      </div>
    );
  }

  const roots = await prisma.folder.findMany({
    where: { parentId: null, createdById: userId },
    orderBy: { name: "asc" },
  });

  const activeFolderId = searchParams.folderId ?? roots[0]?.id ?? null;
  const activeDocId = searchParams.docId ?? null;

  return (
    <main
      className="grid h-screen w-full"
      style={{
        gridTemplateColumns: "260px minmax(300px, 0.8fr) minmax(620px, 1.6fr)",
        gridTemplateRows: "1fr",
      }}
    >
      <aside className="overflow-y-auto border-r border-zinc-200 bg-white">
        <SidebarTree roots={roots} activeFolderId={activeFolderId} />
      </aside>

      <section className="min-w-[300px] overflow-y-auto border-r border-zinc-200 bg-zinc-50">
        {activeFolderId ? (
          <FolderPane folderId={activeFolderId} />
        ) : roots.length === 0 ? (
          <EmptyState title="루트 폴더가 없습니다. 먼저 폴더를 만들어 주세요." />
        ) : (
          <EmptyState title="폴더를 선택해 주세요." />
        )}
      </section>

      <section className="min-w-[620px] overflow-y-auto bg-white">
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
  return (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      {title}
    </div>
  );
}
