import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

const cookieName = "makam_demo_session";
const encoder = new TextEncoder();
type Session = { id: string; role: "customer" | "owner"; exp: number };

function secret() {
  return (env as unknown as { DEMO_SESSION_SECRET?: string }).DEMO_SESSION_SECRET || "";
}

const encode = (input: Uint8Array) => btoa(String.fromCharCode(...input)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (input: string) => Uint8Array.from(atob(input.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));

async function key() {
  return crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function makeDemoCookie(role: "customer" | "owner") {
  if (!secret()) throw new Error("demo_auth_unavailable");
  const session: Session = { id: role === "owner" ? "demo-owner" : "demo-customer", role, exp: Date.now() + 8 * 60 * 60 * 1000 };
  const payload = encode(encoder.encode(JSON.stringify(session)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload))));
  return `${cookieName}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`;
}

export function clearDemoCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getDemoUser(): Promise<ChatGPTUser | null> {
  if (!secret()) return null;
  const requestHeaders = await headers();
  const token = requestHeaders.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token) return null;
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const valid = await crypto.subtle.verify("HMAC", await key(), decode(signature), encoder.encode(payload));
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(decode(payload))) as Session;
    if (session.exp <= Date.now() || !["customer", "owner"].includes(session.role) || session.id !== `demo-${session.role}`) return null;
    return { userId: session.id, email: `${session.id}@demo.magam.local`, displayName: session.role === "owner" ? "점주 데모" : "고객 데모", fullName: null };
  } catch { return null; }
}
