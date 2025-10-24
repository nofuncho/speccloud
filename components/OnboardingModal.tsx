// components/OnboardingModal.tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number; // 기본 720
};

export default function OnboardingModal({
  open,
  onClose,
  title = "기초세팅",
  children,
  maxWidth = 720,
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

  if (typeof window === "undefined" || !open) return null;

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-6"
      aria-modal
      role="dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        ref={ref}
        className="relative w-full max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5"
        style={{ maxWidth }}
      >
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

        <div className="p-4 sm:p-5 bg-gray-50/60">
          <div className="rounded-xl border border-gray-200 bg-white">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
