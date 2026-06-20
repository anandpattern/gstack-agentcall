import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

/**
 * Email magic-link sender. POST { email } → signs a short-lived JWT carrying
 * the email and emails a sign-in link via Resend. The /magic page redeems it
 * through the Auth.js "magic" Credentials provider (see auth.ts). Stateless:
 * the signed link is the only proof, so there's no verification-token store.
 *
 * Env: AUTH_SECRET (signs the link — must match auth.ts), RESEND_API_KEY,
 * RESEND_FROM (verified sender; defaults to Resend's shared onboarding address
 * which only delivers to the Resend account owner until a domain is verified).
 */
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "");
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.RESEND_FROM || "gstack <onboarding@resend.dev>";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!RESEND_API_KEY || !process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "Email sign-in isn't configured." }, { status: 500 });
  }

  const token = await new SignJWT({ email, purpose: "magic" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(SECRET);

  const link = `${req.nextUrl.origin}/magic?token=${encodeURIComponent(token)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: email,
      subject: "Your gstack sign-in link",
      html: `
        <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
          <p>Click below to sign in to <strong>gstack</strong>:</p>
          <p style="margin:24px 0">
            <a href="${link}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block">Sign in to gstack</a>
          </p>
          <p style="color:#666;font-size:13px">This link expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
        </div>`,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return NextResponse.json({ error: "Couldn't send the email.", detail }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
