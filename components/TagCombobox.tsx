"use client";

import { useEffect, useMemo, useRef, useState, KeyboardEvent } from "react";

type Props = {
  type: "company" | "role";
  value: string;
  placeholder: string;
  /** 선택/입력 확정 시 호출 (커밋 시점에만 호출) */
  onChange: (val: string) => void;
};

export default function TagCombobox({ type, value, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  /** 입력 중 내부값 */
  const [q, setQ] = useState(value || "");
  const [items, setItems] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 디바운스 타이머(검색)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 바깥 클릭으로 닫힐 때 중복 커밋 방지
  const justCommittedRef = useRef(false);

  /** 아이콘 (디자인 통일) */
  const Icon = useMemo(
    () => (type === "company" ? "🏢" : "👤"),
    [type]
  );

  /** 외부값 바뀌면 입력값 동기화 */
  useEffect(() => {
    setQ(value || "");
  }, [value]);

  /** 검색 API */
  const fetchItems = async (keyword: string) => {
    const url = `/api/lookup?type=${encodeURIComponent(type)}&q=${encodeURIComponent(keyword)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data: { results: string[] } = await res.json();
      setItems(Array.isArray(data.results) ? data.results : []);
    } catch {
      // 무시 (네트워크 에러 등)
    }
  };

  /** 디바운스 검색 (길이 0이면 추천/빈 리스트) */
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void fetchItems(q);
    }, 180);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, type]);

  /** 커밋 유틸 (부모에 확정 전달) */
  const commit = (val: string) => {
    const next = val.trim();
    // 현재 부모 값과 다를 때만 호출 (불필요한 저장 방지)
    if (next !== (value || "")) {
      onChange(next);
      justCommittedRef.current = true; // 바깥클릭 close시 중복 커밋 방지
    }
  };

  /** 바깥 클릭 시 닫고 필요하면 커밋 */
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      const el = e.target as Node;
      const inside = boxRef.current.contains(el);
      if (!inside) {
        // 바깥 클릭으로 닫힐 때, 입력값이 변경되어 있으면 커밋
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

  /** 키 입력 핸들링 */
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME 조합 중이면 Enter 무시
    // @ts-expect-error: isComposing은 브라우저 nativeEvent에 존재
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter") {
      e.preventDefault();
      commit(q);
      setOpen(false);
    } else if (e.key === "Tab") {
      // 탭으로 포커스 이동할 때도 커밋
      commit(q);
      setOpen(false);
    } else if (e.key === "Escape") {
      // 취소: 입력값을 부모값으로 되돌리고 닫기
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
            // input 자체 blur로 포커스 잃을 때도 커밋 (드롭다운 클릭은 mousedown에서 먼저 처리)
            // 단, 바로 직전에 커밋된 것이면 중복 방지
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
              {items.map((it) => (
                <li key={it}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50"
                    onClick={() => {
                      setQ(it);
                      commit(it);
                      setOpen(false);
                    }}
                    role="option"
                    aria-selected={q === it}
                  >
                    <span className="text-zinc-400">{Icon}</span>
                    <span className="truncate">{it}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
