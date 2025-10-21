"use client";

import { useTransition } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { createFolder } from "@/app/actions/folderActions";
import { createDocumentAction } from "@/app/actions/documentActions";

type Props = { folderId: string };

export default function FolderActionsClient({ folderId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const goOpenDoc = (docId: string) => {
    const sp = new URLSearchParams();
    sp.set("folderId", folderId);
    sp.set("docId", docId);
    router.push(`/app?${sp.toString()}`);
  };

  const createBasicDoc = () => {
    if (isPending) return;
    startTransition(async () => {
      const doc = await createDocumentAction({
        folderId,
        title: "New Document",
      });
      if (doc?.id) goOpenDoc(doc.id);
    });
  };

  const onCreateFolder = () => {
    if (isPending) return;
    startTransition(async () => {
      await createFolder(folderId, "New Folder");
      // TODO: 좌측 트리 리프레시 로직이 있다면 연결
    });
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
      <button
        type="button"
        onClick={createBasicDoc}
        className="inline-flex h-8 flex-1 min-w-[44px] flex-shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 sm:flex-none sm:px-3 xl:border-0 xl:bg-sky-600 xl:text-white xl:hover:bg-sky-700"
        disabled={isPending}
        title="Create document"
      >
        <Plus className="h-4 w-4 text-zinc-500 xl:hidden" aria-hidden="true" />
        <span className="hidden xl:inline">New document</span>
      </button>

      <button
        type="button"
        onClick={onCreateFolder}
        className="inline-flex h-8 flex-1 min-w-[44px] flex-shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 sm:flex-none sm:px-3"
        disabled={isPending}
        title="Create folder"
      >
        <FolderPlus className="h-4 w-4 text-zinc-500 xl:hidden" aria-hidden="true" />
        <span className="hidden xl:inline">New folder</span>
      </button>
    </div>
  );
}
