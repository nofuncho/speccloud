// app/api/register/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (exists)
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email: email.toLowerCase(), password: hashed, name: name ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
