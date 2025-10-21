"use client";

import { useState } from "react";
import { Check, Lock, Pencil, X } from "lucide-react";

import { renameFolder } from "@/app/actions/folderActions";

const DEFAULT_FOLDER_NAME = "새 폴더";

export default function FolderTitleInline({
  folderId,
  initialName,
  locked = false,
}: {
  folderId: string;
  initialName: string;
  locked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);

  async function save() {
    const safe = name.trim() || DEFAULT_FOLDER_NAME;
    setPending(true);
    try {
      await renameFolder(folderId, safe);
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  if (locked) {
    return (
      <div className="flex min-w-[200px] items-center gap-2">
        <h2 className="truncate text-xl font-semibold text-zinc-900">
          {initialName}
        </h2>
        <span
          className="inline-flex items-center text-zinc-400"
          title="루트 폴더는 이름을 변경할 수 없습니다."
        >
          <Lock size={16} />
        </span>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="group flex min-w-[200px] items-center gap-2">
        <h2 className="truncate text-xl font-semibold text-zinc-900">
          {initialName}
        </h2>
        <button
          type="button"
          aria-label="폴더명 변경"
          onClick={() => setEditing(true)}
          className="p-1 text-zinc-400 transition hover:text-zinc-600"
          title="폴더명 변경"
        >
          <Pencil size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-[200px] items-center gap-2">
      <input
        className="h-8 min-w-[180px] max-w-xs rounded border border-zinc-300 bg-white px-2 text-lg font-medium"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setName(initialName);
            setEditing(false);
          }
        }}
        autoFocus
        disabled={pending}
      />
      <button
        type="button"
        onClick={save}
        className="p-1 text-zinc-400 transition hover:text-emerald-600 disabled:opacity-50"
        title="저장"
        disabled={pending}
      >
        <Check size={18} />
      </button>
      <button
        type="button"
        onClick={() => {
          setName(initialName);
          setEditing(false);
        }}
        className="p-1 text-zinc-400 transition hover:text-rose-600 disabled:opacity-50"
        title="취소"
        disabled={pending}
      >
        <X size={18} />
      </button>
    </div>
  );
}
