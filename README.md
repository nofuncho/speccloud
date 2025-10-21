# SpecCloud Starter (Next.js + Tailwind + Firebase + Zustand)

## 0) 요구사항
- Node.js 18+
- npm 또는 yarn

## 1) 설치
```bash
npm install
# or: yarn
```

## 2) 개발 서버
```bash
npm run dev
# http://localhost:3000
```

## 3) 환경변수
- `.env.local.example`를 복사해서 `.env.local` 생성 후 값을 채우세요.

## 4) 폴더 구조
```
app/                # App Router (TopBar, FolderTree, FileList, AIAssistantPanel)
components/         # UI 컴포넌트
lib/firebase.ts     # Firebase 초기화
store/useSpecStore  # 글로벌 상태 (샘플 데이터)
```

## 5) 다음 단계
- Firestore 컬렉션 설계 (folders, files, tags, versions)
- 파일 업로드 (Storage) + 메타추출
- OpenAI 연결 후 JD-갭분석 & 리라이팅
- Export 파이프라인 (PDF/DOCX/Notion)
