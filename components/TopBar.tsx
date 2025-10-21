"use client";

import { Search, Plus, User } from "lucide-react";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center gap-3">
        <div className="font-bold tracking-tight text-lg">SPEC CLOUD</div>

        <nav className="hidden md:flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-sm">내 스펙함</button>
          <button className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-sm">공모전함</button>
        </nav>

        <div className="flex-1" />

        <div className="relative w-full max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            placeholder="제목 · 태그 · 본문 통합검색"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-brand-sky"
          />
        </div>

        <button className="ml-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-sky text-white text-sm hover:opacity-90">
          <Plus className="h-4 w-4" /> 새로 만들기
        </button>

        <button className="ml-1 p-2 rounded-xl border border-gray-200">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
