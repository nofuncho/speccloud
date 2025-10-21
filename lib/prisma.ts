// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "error", "warn"], // 개발 중에는 쿼리 로그 보기 편하게
  });

// Next.js에서는 hot reload 때마다 PrismaClient가 중복 생성되지 않게 global에 저장
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
