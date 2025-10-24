// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

/**
 * ✅ PrismaClient 싱글톤 설정
 * - Next.js 개발 환경(HMR)에서 중복 생성 방지
 * - production 환경에서는 1회성 생성
 * - 개발 시 쿼리, 경고, 에러 로그 표시
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
