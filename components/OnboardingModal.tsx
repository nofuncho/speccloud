// components/OnboardingModal.tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
  frameless?: boolean;
  noInnerCard?: boolean;
  bodyClassName?: string;
};

export default function OnboardingModal({
  open,
  onClose,
  title = "기초세팅 (채팅)",
  children,
  maxWidth = 720,
  frameless = false,
  noInnerCard = false,
  bodyClassName,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof window === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      aria-modal
      role="dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* overlay */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        ref={ref}
        className={
          frameless
            ? "relative w-full max-h-[90vh] overflow-visible bg-transparent shadow-none ring-0"
            : "relative w-full max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5"
        }
        style={{ maxWidth }}
      >
        {frameless ? (
          // ✅ 채팅 프레임 중앙 유지, 헤더만 위로 띄우기
          <div className="relative w-[min(90vw,380px)] mx-auto">
            {/* 헤더(타이틀 + X) — 채팅 프레임 기준 상단 위로 */}
            <div className="absolute -top-20 left-0 right-0 z-20 flex items-center justify-between">
              <div className="select-none text-white text-[15px] font-semibold drop-shadow">
                {title}
              </div>
              <button
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
                aria-label="닫기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* 채팅 프레임 (그대로 중앙) */}
            {children}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="text-xl">🧩</div>
                <h2 className="text-[15px] font-semibold text-gray-800">{title}</h2>
              </div>
              <button
                onClick={onClose}
                className="group inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"
                aria-label="닫기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" className="text-gray-500 group-hover:text-gray-700">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className={bodyClassName ?? "p-4 sm:p-5 bg-gray-50/60"}>
              {noInnerCard ? children : <div className="rounded-xl border border-gray-200 bg-white">{children}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
