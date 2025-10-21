"use client";

import { useSpecStore } from "@/store/useSpecStore";
import { ChevronRight, Folder, Star, Clock } from "lucide-react";
import { useState } from "react";

function Node({ id }: { id: string }) {
  const { nodes } = useSpecStore();
  const n = nodes[id];
  const [open, setOpen] = useState(true);

  if (!n) return null;
  const hasChildren = n.children && n.children.length > 0;

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50"
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-4" />
        )}
        <Folder className="h-4 w-4 text-amber-500" />
        <span className="text-sm">{n.name}</span>
      </div>

      {open && hasChildren && (
        <div className="ml-5 border-l border-gray-100">
          {n.children!.map((cid) => (
            <Node key={cid} id={cid} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTree() {
  const { rootId } = useSpecStore();

  return (
    <aside className="h-[calc(100vh-84px)] overflow-auto scroll-thin">
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-1">
          <Star className="h-3.5 w-3.5" /> 즐겨찾기
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-1">
          <Clock className="h-3.5 w-3.5" /> 최근
        </div>
      </div>
      <div className="p-2">
        <Node id={rootId} />
      </div>
    </aside>
  );
}
