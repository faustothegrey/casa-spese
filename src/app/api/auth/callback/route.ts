import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client, saveToken } from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  saveToken(tokens);

  return NextResponse.redirect(new URL("/", request.url));
}
