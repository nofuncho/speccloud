// app/login/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(sp.get("error") ?? null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) {
      router.push("/app"); // 내부 메인
    } else {
      setErr("이메일 또는 비밀번호를 확인해 주세요.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-6 rounded-2xl shadow">
        <h1 className="text-xl font-semibold mb-4">SPEC CLOUD 로그인</h1>
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2"
            type="email" placeholder="이메일"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full border rounded-lg px-3 py-2"
            type="password" placeholder="비밀번호"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2 bg-blue-600 text-white disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          계정이 없나요? <a className="text-blue-600" href="/register">회원가입</a>
        </p>
      </form>
    </div>
  );
}
