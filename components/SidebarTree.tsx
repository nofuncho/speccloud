import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { LogIn, UserCircle2 } from "lucide-react";

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
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
          <Link href="/" className="inline-flex h-8 w-8 items-center justify-center">
            <Image src="/spec-logo.svg" alt="SpecCloud 로고" width={28} height={28} priority />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
            aria-label="로그인"
          >
            <LogIn className="h-5 w-5" />
          </Link>
        </div>
        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
          문서를 관리하려면 먼저 로그인해 주세요.
        </div>
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
      <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
        <Link href="/app" className="inline-flex h-8 w-8 items-center justify-center">
          <Image src="/spec-logo.svg" alt="SpecCloud 로고" width={28} height={28} priority />
        </Link>
        <Link
          href="/app"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
          aria-label="계정"
        >
          <UserCircle2 className="h-5 w-5" />
        </Link>
      </div>
      <nav className="space-y-2">
        {roots.length === 0 ? (
          <div className="rounded px-2 py-2 text-sm text-gray-500">아직 폴더가 없습니다.</div>
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

function FolderNode({ node, childrenMap, activeFolderId, depth }: NodeProps) {
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
