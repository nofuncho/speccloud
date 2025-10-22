import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type FolderSummary = { id: string; name: string; parentId: string | null };
type Props = { roots: { id: string; name: string }[]; activeFolderId: string | null };

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
  const q = sp.toString();
  return q ? `/app?${q}` : "/app";
}

function getInitialAndColor(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "").trim() || "U";
  const initial = src[0]?.toUpperCase() ?? "U";
  let sum = 0;
  for (let i = 0; i < src.length; i++) sum += src.charCodeAt(i);
  const color = AVATAR_COLORS[sum % AVATAR_COLORS.length];
  return { initial, color };
}

/** 간단 온도 게이지 */
function ThermoGauge({ celsius = 36.5 }: { celsius?: number }) {
  const min = 34, max = 40;
  const pct = Math.max(0, Math.min(100, ((celsius - min) / (max - min)) * 100));
  return (
    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-rose-400 via-amber-400 to-lime-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function SidebarTree({ roots, activeFolderId }: Props) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  // 상단 로고 (상/하 여백 줄임: py-4 → py-2.5)
  const Logo = () => (
    <div className="py-2.5 pl-4 pr-3 border-b border-gray-100">
      <Link href={userId ? "/app" : "/"} className="block">
        <div className="max-w-[140px] aspect-[3/1] relative">
          <Image src="/brand/speccloud-logo.svg" alt="SpecCloud" fill sizes="140px" priority className="object-contain" />
        </div>
      </Link>
    </div>
  );

  if (!userId) {
    return (
      <div className="flex h-full flex-col">
        <Logo />
        <div className="p-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
            <Image src="/brand/speccloud-logo.svg" alt="icon" width={64} height={64} className="mx-auto mb-2 opacity-90" />
            <p className="text-sm text-gray-600 mb-3">로그인 후 이용 가능합니다</p>
            <div className="flex gap-2">
              <Link href="/login" className="flex-1 py-2 bg-black text-white rounded-lg text-sm hover:opacity-90">로그인</Link>
              <Link href="/signup" className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-white">회원가입</Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // 폴더 트리 데이터
  const all = await prisma.folder.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, parentId: true },
  });

  const childrenMap = new Map<string | null, FolderSummary[]>();
  for (const f of all) {
    const key = f.parentId ?? null;
    const arr = childrenMap.get(key) ?? [];
    arr.push(f);
    childrenMap.set(key, arr);
  }

  const { initial, color } = getInitialAndColor(session?.user?.name, session?.user?.email);
  const avatar = session?.user?.image ?? null;

  const existingNames = new Set(all.map((f) => f.name));
  const documentFeatures = DOCUMENT_FEATURES.filter((x) => !existingNames.has(x));
  const docRoots = roots.filter((r) => DOCUMENT_FEATURES.includes(r.name));
  const otherRoots = roots.filter((r) => !DOCUMENT_FEATURES.includes(r.name));
  const hasDocumentGroup = docRoots.length > 0 || documentFeatures.length > 0;

  return (
    <div className="flex h-full flex-col">
      <Logo />

      {/* Nav (여기서는 내부 스크롤 금지) */}
      <nav className="mt-3 flex-1 space-y-4 text-[15px] px-3">
        {!hasDocumentGroup && otherRoots.length === 0 ? (
          <div className="px-2 py-2 text-sm text-gray-500">아직 폴더가 없습니다.</div>
        ) : (
          <>
            {hasDocumentGroup && (
              <div className="space-y-2">
                <p className="pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-gray-500">문서</p>
                <div className="space-y-1">
                  {docRoots.map((root) => (
                    <FolderNode key={root.id} node={root} childrenMap={childrenMap} activeFolderId={activeFolderId} depth={0} />
                  ))}
                  {documentFeatures.map((item) => <DocumentFeaturePlaceholder key={item} label={item} />)}
                </div>
              </div>
            )}
            {otherRoots.map((root) => (
              <FolderNode key={root.id} node={root} childrenMap={childrenMap} activeFolderId={activeFolderId} depth={0} />
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

      {/* 하단 프로필 */}
      <div className="px-4 pb-5">
        <div className="rounded-xl border border-gray-100 bg-white p-4 w-full box-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-gray-100 relative">
              {avatar ? (
                <Image src={avatar} alt="user" fill className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{session?.user?.name ?? "사용자"}</p>
              <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
            </div>
            <Link href="/settings" className="ml-auto shrink-0 text-xs text-gray-500 hover:text-gray-700">프로필</Link>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>열정 온도</span>
              <span className="font-medium text-gray-700">36.5°C</span>
            </div>
            <ThermoGauge celsius={36.5} />
            <p className="mt-2 text-[11px] text-gray-400">* 베타 — 추후 활동 지표 기반으로 고도화 예정</p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ===== Sub components ===== */

function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 pt-4 text-[13px] text-gray-500 px-4 pb-5">
      <div className="space-y-1 pl-2">
        <p className="font-semibold text-gray-600">고객센터</p>
        <p className="font-semibold text-gray-600">공지사항</p>
      </div>
      <div className="space-y-1 text-xs leading-relaxed text-gray-400 mt-2 pl-2">
        <div className="flex flex-wrap gap-x-2">
          <Link href="/terms" className="hover:text-[#1D4ED8]">약관</Link>
          <Link href="/terms/business" className="hover:text-[#1D4ED8]">사업자정보</Link>
          <Link href="/terms/privacy" className="hover:text-[#1D4ED8]">개인정보처리방침</Link>
        </div>
        <p className="mt-1">© 2024 SpecCloud Corp.</p>
      </div>
    </footer>
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
  const depthFont = depth === 0 ? "text-[15px] font-semibold" : "text-sm";
  const active = isActive ? "bg-[#E0E7FF] text-[#1D4ED8]" : "hover:bg-gray-100 hover:text-[#1D4ED8]";
  const paddingLeft = BASE_INDENT + depth * CHILD_INDENT_STEP;

  return (
    <div>
      <Link
        href={toAppUrl({ folderId: node.id })}
        className={`block rounded py-2 pr-2 ${depthFont} transition text-gray-800 ${active}`}
        style={{ paddingLeft }}
      >
        {node.name}
      </Link>
      {children.length > 0 && (
        <div className="space-y-1">
          {children.map((child) => (
            <FolderNode key={child.id} node={child} childrenMap={childrenMap} activeFolderId={activeFolderId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="pl-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="rounded py-2 pr-2 pl-4 text-[15px] font-semibold text-gray-800 hover:bg-gray-100 hover:text-[#1D4ED8] transition">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentFeaturePlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded py-2 pr-2 pl-4 text-[15px] font-semibold text-gray-400">
      {label}
    </div>
  );
}
