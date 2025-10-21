// app/register/page.tsx
"use client";

import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (res.ok) setOk(true);
    else {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error ?? "회원가입 실패");
    }
  }

  if (ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-6 rounded-2xl shadow">
          <h1 className="text-xl font-semibold">가입 완료</h1>
          <p className="mt-2">이제 <a className="text-blue-600" href="/login">로그인</a> 해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-6 rounded-2xl shadow">
        <h1 className="text-xl font-semibold mb-4">SPEC CLOUD 회원가입</h1>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2"
                 placeholder="이름(선택)" value={name} onChange={e=>setName(e.target.value)} />
          <input className="w-full border rounded-lg px-3 py-2"
                 type="email" placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full border rounded-lg px-3 py-2"
                 type="password" placeholder="비밀번호" value={password} onChange={e=>setPassword(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="w-full rounded-lg py-2 bg-blue-600 text-white">회원가입</button>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          이미 계정이 있나요? <a className="text-blue-600" href="/login">로그인</a>
        </p>
      </form>
    </div>
  );
}
