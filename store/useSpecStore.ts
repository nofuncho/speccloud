import { create } from "zustand";

type Node = {
  id: string;
  name: string;
  children?: string[];
};

type FileItem = {
  id: string;
  title: string;
  company: string;
  updatedAt: string;
  status?: "draft" | "ai-reviewed" | "submitted";
  hasProof?: boolean;
};

type State = {
  rootId: string;
  nodes: Record<string, Node>;
  files: FileItem[];
  toggle: (id: string) => void;
};

export const useSpecStore = create<State>(() => ({
  rootId: "root",
  nodes: {
    root: { id: "root", name: "My Specs", children: ["kakao", "contest", "misc"] },
    kakao: { id: "kakao", name: "🏢 카카오_마케팅직", children: ["kakao_docs"] },
    kakao_docs: { id: "kakao_docs", name: "📄 문서", children: [] },
    contest: { id: "contest", name: "🏆 공모전_광고캠프", children: [] },
    misc: { id: "misc", name: "📁 기타자료", children: [] },
  },
  files: [
    { id: "f1", title: "자소서_초안1.docx", company: "카카오", updatedAt: "2025-10-20", status: "draft" },
    { id: "f2", title: "최종본.pdf", company: "카카오", updatedAt: "2025-10-21", status: "ai-reviewed", hasProof: true },
    { id: "f3", title: "합격메일.png", company: "카카오", updatedAt: "2025-09-30", status: "submitted" }
  ],
  toggle: () => {}
}));
