"use client";

import { useEffect, useMemo, useRef, useState, KeyboardEvent, useCallback } from "react";

type Props = {
  type: "company" | "role";
  value: string;
  placeholder: string;
  /** 선택/입력 확정 시 호출 (커밋 시점에만 호출) */
  onChange: (val: string) => void;
};

export default function TagCombobox({ type, value, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const [items, setItems] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const justCommittedRef = useRef(false);

  /** 아이콘 (디자인 통일) */
  const Icon = useMemo(() => (type === "company" ? "🏢" : "👤"), [type]);

  /** 외부값 바뀌면 입력값 동기화 */
  useEffect(() => {
    setQ(value || "");
  }, [value]);

  /** 검색 API (최근검색 병합 버전) — useCallback으로 메모이즈 */
  const fetchItems = useCallback(
    async (keyword: string) => {
      // ✅ 로컬 최근값
      let recent: string[] = [];
      try {
        const key = type === "company" ? "recent_companies" : "recent_roles";
        recent = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {}

      const url = `/api/lookup?type=${encodeURIComponent(type)}&q=${encodeURIComponent(
        keyword
      )}&recent=${encodeURIComponent(recent.join(","))}`;

      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data: { results: string[] } = await res.json();
        setItems(Array.isArray(data.results) ? data.results : []);
      } catch {
        // 무시 (네트워크 에러 등)
      }
    },
    [type]
  );

  /** 디바운스 검색 — 의존성에 fetchItems 포함 (경고 해소) */
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchItems(q);
    }, 180);
    return () => clearTimeout(t);
  }, [q, fetchItems]);

  /** 커밋 (입력 확정 + 최근검색 저장) */
  const commit = (val: string) => {
    const next = val.trim();
    if (next !== (value || "")) {
      onChange(next);
      justCommittedRef.current = true;
      try {
        const key = type === "company" ? "recent_companies" : "recent_roles";
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        const nextArr = [next, ...arr.filter((x: string) => x !== next)].slice(0, 10);
        localStorage.setItem(key, JSON.stringify(nextArr));
      } catch {}
    }
  };

  /** 바깥 클릭 시 닫기 */
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        if (!justCommittedRef.current && q.trim() !== (value || "")) {
          commit(q);
        }
        justCommittedRef.current = false;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [q, value]);

  /** 키보드 입력 처리 */
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // @ts-expect-error isComposing은 nativeEvent에 존재
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commit(q);
      setOpen(false);
    } else if (e.key === "Escape") {
      setQ(value || "");
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      {/* 입력 칩 */}
      <div
        className="group inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 h-8 text-xs text-zinc-700 hover:border-sky-200 cursor-text"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-[6px] bg-zinc-100 text-zinc-500">
          {Icon}
        </span>
        <input
          className="w-40 md:w-56 bg-transparent outline-none placeholder:text-zinc-400"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          onBlur={() => {
            if (!justCommittedRef.current && q.trim() !== (value || "")) {
              commit(q);
            }
            justCommittedRef.current = false;
          }}
        />
        {value && (
          <button
            type="button"
            className="rounded-md px-1 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-700"
            onClick={(e) => {
              e.stopPropagation();
              setQ("");
              commit("");
              setOpen(false);
            }}
            title="지우기"
          >
            ✕
          </button>
        )}
      </div>

      {/* 드롭다운 */}
      {open && (
        <div
          className="absolute z-50 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm"
          role="listbox"
          aria-label={type === "company" ? "회사 선택" : "포지션 선택"}
        >
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">결과 없음</div>
          ) : (
            <ul className="max-h-60 overflow-auto">
              {items.map((it) => {
                const isRecent = it.startsWith("🔁 ");
                const label = isRecent ? it.replace("🔁 ", "") : it;
                return (
                  <li key={it}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                        isRecent ? "text-zinc-500" : "hover:bg-zinc-50"
                      }`}
                      onClick={() => {
                        setQ(label);
                        commit(label);
                        setOpen(false);
                      }}
                      role="option"
                      aria-selected={q === label}
                    >
                      <span className="text-zinc-400">{isRecent ? "🔁" : Icon}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
