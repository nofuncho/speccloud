// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// ✅ 로그인 성공 시 사용자 루트 폴더 자동 생성
async function ensureRootFolders(userId: string) {
  console.log("🧩 ensureRootFolders() called with userId =", userId);
  if (!userId) {
    console.error("❌ ensureRootFolders: userId가 비어 있습니다.");
    return;
  }

  const roots = [
    { name: "자기소개서", type: "ROOT_COVERLETTER" as const },
    { name: "이력서", type: "ROOT_RESUME" as const },
    { name: "포트폴리오", type: "ROOT_PORTFOLIO" as const },
  ];

  for (const r of roots) {
    const exists = await prisma.folder.findFirst({
      where: { createdById: userId, parentId: null, name: r.name },
    });

    if (!exists) {
      console.log(`📁 Creating root folder: ${r.name} for userId=${userId}`);
      await prisma.folder.create({
        data: {
          name: r.name,
          type: r.type,
          createdById: userId,
        },
      });
    }
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) {
          console.error("❌ authorize: email 또는 password 없음");
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
          console.error("❌ authorize: 해당 이메일 없음 or password 필드 누락");
          return null;
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          console.error("❌ authorize: 비밀번호 불일치");
          return null;
        }

        console.log("✅ authorize success:", user.id, user.email);
        return { id: user.id, name: user.name ?? null, email: user.email };
      },
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      console.log("⚙️ signIn callback 실행됨, user.id =", user?.id);
      if (user?.id) {
        try {
          await ensureRootFolders(user.id as string);
        } catch (err) {
          console.error("❌ ensureRootFolders error:", err);
        }
      } else {
        console.error("❌ signIn: user.id가 없습니다.");
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },

    async session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },

    // ✅ 추가: 로그인 후 항상 /app으로 이동
    async redirect({ url, baseUrl }) {
      return `${baseUrl}/app`;
    },
  },

  pages: {
    signIn: "/login",
  },
};
