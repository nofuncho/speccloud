// components/SidebarTree.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type FolderSummary = {
  id: string;
  name: string;
  parentId: string | null;
};

type Props = {
  roots: { id: string; name: string }[];
  activeFolderId: string | null;
};

function toAppUrl(params: { folderId?: string | null; docId?: string | null }) {
  const sp = new URLSearchParams();
  if (params.folderId) sp.set("folderId", params.folderId);
  if (params.docId) sp.set("docId", params.docId);
  const query = sp.toString();
  return query ? `/app?${query}` : "/app";
}

export default async function SidebarTree({ roots, activeFolderId }: Props) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return (
      <div className="p-3 text-sm text-gray-500">
        로그인 후 이용할 수 있습니다.
      </div>
    );
  }

  const all = await prisma.folder.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, parentId: true },
  });

  const childrenMap = new Map<string | null, FolderSummary[]>();
  for (const folder of all) {
    const key = folder.parentId ?? null;
    const children = childrenMap.get(key) ?? [];
    children.push(folder);
    childrenMap.set(key, children);
  }

  return (
    <div className="space-y-3 p-3">
      <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Spec 폴더
      </div>
      <nav className="space-y-2">
        {roots.length === 0 ? (
          <div className="rounded px-2 py-2 text-sm text-gray-500">
            아직 폴더가 없습니다.
          </div>
        ) : (
          roots.map((root) => (
            <FolderNode
              key={root.id}
              node={root}
              childrenMap={childrenMap}
              activeFolderId={activeFolderId}
              depth={0}
            />
          ))
        )}
      </nav>
    </div>
  );
}

type NodeProps = {
  node: { id: string; name: string };
  childrenMap: Map<string | null, FolderSummary[]>;
  activeFolderId: string | null;
  depth: number;
};

function FolderNode({
  node,
  childrenMap,
  activeFolderId,
  depth,
}: NodeProps) {
  const children = childrenMap.get(node.id) ?? [];
  const isActive = activeFolderId === node.id;

  return (
    <div>
      <Link
        href={toAppUrl({ folderId: node.id, docId: null })}
        className={`block rounded px-2 py-1 text-sm transition ${
          isActive ? "bg-blue-100 font-semibold text-blue-700" : "hover:bg-gray-100"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {node.name}
      </Link>
      {children.length > 0 && (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              childrenMap={childrenMap}
              activeFolderId={activeFolderId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
