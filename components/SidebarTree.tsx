import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { LogIn } from "lucide-react";

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

const AVATAR_COLORS = ["#2563EB", "#EC4899", "#9333EA", "#059669", "#F59E0B", "#0EA5E9", "#14B8A6"];

function toAppUrl(params: { folderId?: string | null; docId?: string | null }) {
  const sp = new URLSearchParams();
  if (params.folderId) sp.set("folderId", params.folderId);
  if (params.docId) sp.set("docId", params.docId);
  const query = sp.toString();
  return query ? `/app?${query}` : "/app";
}

function getInitialAndColor(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim() || "U";
  const initial = source[0]?.toUpperCase() ?? "U";
  let sum = 0;
  for (let i = 0; i < source.length; i += 1) {
    sum += source.charCodeAt(i);
  }
  const color = AVATAR_COLORS[sum % AVATAR_COLORS.length];
  return { initial, color };
}

export default async function SidebarTree({ roots, activeFolderId }: Props) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return (
      <div className="space-y-4 p-3">
        <div className="flex items-center justify-between px-1">
          <Link href="/" className="inline-flex h-12 w-12 items-center justify-center">
            <Image src="/spec-logo.svg" alt="SpecCloud logo" width={40} height={40} priority />
          </Link>
          <Link
            href="/login"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition hover:border-gray-400 hover:text-gray-900"
            aria-label="로그인"
          >
            <LogIn className="h-5 w-5" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="px-1 text-sm text-gray-500">로그인 후 폴더를 생성하고 문서를 관리해 보세요.</div>
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

  const { initial, color } = getInitialAndColor(session?.user?.name, session?.user?.email ?? undefined);
  const avatarImage = session?.user?.image ?? null;

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center justify-between px-1">
        <Link href="/app" className="inline-flex h-12 w-12 items-center justify-center">
          <Image src="/spec-logo.svg" alt="SpecCloud logo" width={40} height={40} priority />
        </Link>
        <Link href="/app" className="inline-flex items-center justify-center" aria-label="계정">
          {avatarImage ? (
            <Image
              src={avatarImage}
              alt={session?.user?.name ?? "사용자"}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {initial}
            </span>
          )}
        </Link>
      </div>
      <nav className="space-y-2">
        {roots.length === 0 ? (
          <div className="px-2 py-2 text-sm text-gray-500">아직 폴더가 없습니다.</div>
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
