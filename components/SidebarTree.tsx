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

const AVATAR_COLORS = ["#1D4ED8", "#EC4899", "#9333EA", "#059669", "#F59E0B", "#0EA5E9", "#14B8A6"];

const DOCUMENT_FEATURES = ["이력서", "자기소개서", "포트폴리오", "경력기술서", "AI탐지기", "모의서류평가"];
const INTERVIEW_FEATURES = ["모의면접", "면접오답노트"];
const CAREER_FEATURES = ["프로젝트 정리", "연봉 계산기"];
const BASE_INDENT = 16;
const CHILD_INDENT_STEP = 14;

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
  const existingFolderNames = new Set(all.map((folder) => folder.name));
  const documentFeatures = DOCUMENT_FEATURES.filter((item) => !existingFolderNames.has(item));
  const documentRootSet = new Set(DOCUMENT_FEATURES);
  const documentRoots = roots.filter((root) => documentRootSet.has(root.name));
  const otherRoots = roots.filter((root) => !documentRootSet.has(root.name));
  const hasDocumentGroup = documentRoots.length > 0 || documentFeatures.length > 0;
  const hasAnyNavItems = hasDocumentGroup || otherRoots.length > 0;

  return (
    <div className="flex h-full flex-col p-3">
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
      <nav className="mt-4 flex-1 space-y-4 text-[15px]">
        {!hasAnyNavItems ? (
          <div className="px-2 py-2 text-sm text-gray-500">아직 폴더가 없습니다.</div>
        ) : (
          <>
            {hasDocumentGroup && (
              <div className="space-y-2">
                <p className="pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-gray-500">문서</p>
                <div className="space-y-1">
                  {documentRoots.map((root) => (
                    <FolderNode
                      key={root.id}
                      node={root}
                      childrenMap={childrenMap}
                      activeFolderId={activeFolderId}
                      depth={0}
                    />
                  ))}
                  {documentFeatures.map((item) => (
                    <DocumentFeaturePlaceholder key={item} label={item} />
                  ))}
                </div>
              </div>
            )}
            {otherRoots.map((root) => (
              <FolderNode
                key={root.id}
                node={root}
                childrenMap={childrenMap}
                activeFolderId={activeFolderId}
                depth={0}
              />
            ))}
          </>
        )}
        <div className="border-t border-gray-200 pt-4">
          <FeatureSection title="면접대비" items={INTERVIEW_FEATURES} />
        </div>
        <div className="border-t border-gray-200 pt-4">
          <FeatureSection title="이직준비" items={CAREER_FEATURES} />
        </div>
      </nav>
      <footer className="mt-auto space-y-3 border-t border-gray-200 pt-4 text-[13px] text-gray-500">
        <div className="space-y-1" style={{ paddingLeft: BASE_INDENT }}>
          <p className="font-semibold text-gray-600">고객센터</p>
          <p className="font-semibold text-gray-600">공지사항</p>
        </div>
        <div className="space-y-1 text-xs leading-relaxed text-gray-400" style={{ paddingLeft: BASE_INDENT }}>
          <div className="flex flex-wrap gap-x-2">
            <Link href="/terms" className="hover:text-[#1D4ED8]">
              약관
            </Link>
            <Link href="/terms/premium" className="hover:text-[#1D4ED8]">
              이용약관
            </Link>
            <Link href="/terms/business" className="hover:text-[#1D4ED8]">
              사업자정보
            </Link>
            <Link href="/terms/privacy" className="hover:text-[#1D4ED8]">
              개인정보처리방침
            </Link>
          </div>
          <p className="text-gray-400">© 2024 SpecCloud Corp.</p>
        </div>
      </footer>
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
  const depthFontClasses = depth === 0 ? "text-[15px] font-semibold text-gray-800" : "text-sm text-gray-600";
  const activeClasses = isActive ? "bg-[#E0E7FF] text-[#1D4ED8]" : "hover:bg-gray-100 hover:text-[#1D4ED8]";
  const paddingLeft = BASE_INDENT + depth * CHILD_INDENT_STEP;

  return (
    <div>
      <Link
        href={toAppUrl({ folderId: node.id, docId: null })}
        className={`block rounded py-2 pr-2 transition ${depthFontClasses} ${activeClasses}`}
        style={{ paddingLeft }}
      >
        {node.name}
      </Link>
    </div>
  );
}

type FeatureSectionProps = {
  title: string;
  items: string[];
};

function FeatureSection({ title, items }: FeatureSectionProps) {
  return (
    <div className="space-y-2">
      <p className="pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className="rounded py-2 pr-2 text-[15px] font-semibold text-gray-800 transition hover:bg-gray-100 hover:text-[#1D4ED8]"
            style={{ paddingLeft: BASE_INDENT }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

type DocumentFeaturePlaceholderProps = {
  label: string;
};

function DocumentFeaturePlaceholder({ label }: DocumentFeaturePlaceholderProps) {
  return (
    <div className="rounded py-2 pr-2 text-[15px] font-semibold text-gray-400" style={{ paddingLeft: BASE_INDENT }}>
      {label}
    </div>
  );
}
