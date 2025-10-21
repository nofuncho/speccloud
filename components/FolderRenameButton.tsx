// components/FolderRenameButton.tsx
"use client";

import { useState } from "react";
import { renameFolder } from "@/app/actions/folderActions";
import { Pencil, Check, X } from "lucide-react";

export default function FolderRenameButton({
  folderId,
  initialName,
}: {
  folderId: string;
  initialName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);

  async function save() {
    const safe = name.trim() || "새 폴더";
    setPending(true);
    try {
      await renameFolder(folderId, safe);
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <button
        aria-label="폴더명 변경"
        onClick={() => setEditing(true)}
        className="ml-2 p-1 rounded text-zinc-400 hover:text-zinc-600 transition"
        title="폴더명 변경"
      >
        <Pencil size={16} />
      </button>
    );
  }

  return (
    <div className="ml-2 flex items-center gap-1">
      <input
        className="h-7 border border-zinc-300 rounded px-2 text-sm"
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
        onClick={save}
        className="p-1 rounded text-zinc-400 hover:text-emerald-600 disabled:opacity-50"
        title="저장"
        disabled={pending}
      >
        <Check size={16} />
      </button>
      <button
        onClick={() => {
          setName(initialName);
          setEditing(false);
        }}
        className="p-1 rounded text-zinc-400 hover:text-rose-600 disabled:opacity-50"
        title="취소"
        disabled={pending}
      >
        <X size={16} />
      </button>
    </div>
  );
}
