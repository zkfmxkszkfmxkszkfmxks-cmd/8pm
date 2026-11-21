import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

const cookieName = "makam_demo_session";
const customerCookieName = "makam_demo_customer_id";
const encoder = new TextEncoder();
type Session = { id: string; role: "customer" | "owner"; exp: number };
type CustomerIdentity = { id: string; exp: number };
const customerIdPattern = /^demo-customer-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function secret() {
  return (env as unknown as { DEMO_SESSION_SECRET?: string }).DEMO_SESSION_SECRET || "";
}

const encode = (input: Uint8Array) => btoa(String.fromCharCode(...input)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (input: string) => Uint8Array.from(atob(input.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));

async function key() {
  return crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function cookieValue(header: string | null, name: string) {
  return header?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function signedValue(value: object) {
  const payload = encode(encoder.encode(JSON.stringify(value)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload))));
  return `${payload}.${signature}`;
}

async function verifiedValue<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !await crypto.subtle.verify("HMAC", await key(), decode(signature), encoder.encode(payload))) return null;
    return JSON.parse(new TextDecoder().decode(decode(payload))) as T;
  } catch { return null; }
}

export async function makeDemoCookies(role: "customer" | "owner") {
  if (!secret()) throw new Error("demo_auth_unavailable");
  const lifetimeSeconds = role === "customer" ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
  const cookies: string[] = [];
  let customerId = "";
  if (role === "customer") {
    const stored = await verifiedValue<CustomerIdentity>(cookieValue((await headers()).get("cookie"), customerCookieName));
    customerId = stored && stored.exp > Date.now() && customerIdPattern.test(stored.id) ? stored.id : `demo-customer-${crypto.randomUUID()}`;
    const identity: CustomerIdentity = { id: customerId, exp: Date.now() + 90 * 24 * 60 * 60 * 1000 };
    cookies.push(`${customerCookieName}=${await signedValue(identity)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${90 * 24 * 60 * 60}`);
  }
  const session: Session = { id: role === "owner" ? "demo-owner" : customerId, role, exp: Date.now() + lifetimeSeconds * 1000 };
  cookies.push(`${cookieName}=${await signedValue(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetimeSeconds}`);
  return cookies;
}

export function clearDemoCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getDemoUser(): Promise<ChatGPTUser | null> {
  if (!secret()) return null;
  const requestHeaders = await headers();
  const session = await verifiedValue<Session>(cookieValue(requestHeaders.get("cookie"), cookieName));
  if (!session) return null;
  const validId = session.role === "owner" ? session.id === "demo-owner" : session.role === "customer" && customerIdPattern.test(session.id);
  if (session.exp <= Date.now() || !validId) return null;
  return { userId: session.id, email: `${session.id}@demo.magam.local`, displayName: session.role === "owner" ? "점주 데모" : "고객 데모", fullName: null };
}
