import { env } from "cloudflare:workers";
import seed from "@/db/seed.json";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

type Row = Record<string, unknown>;
type SeedMenu = [number, string, string, number, number, string, string];
const seedData = seed as { shops: Array<{ id: string; name: string; category?: string; area: string; address: string; lat: number; lng: number; image: string }>; menus: SeedMenu[] };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message || code); }
}

export function database(): D1Database {
  if (!env.DB) throw new ApiError(503, "database_unavailable");
  return env.DB;
}

export function bucket(): R2Bucket {
  if (!env.BUCKET) throw new ApiError(503, "photo_storage_unavailable");
  return env.BUCKET;
}

export const now = () => Date.now();
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const timeKst = (ms: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);

export function closingMillis(date: string, closing: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(closing);
  if (!match) throw new ApiError(400, "invalid_closing_time");
  return Date.parse(`${date}T${closing}:00+09:00`);
}

export function isOwner(user: ChatGPTUser | null) {
  if (user?.userId === "demo-owner") return true;
  const allowed = (env as unknown as { OWNER_EMAIL?: string }).OWNER_EMAIL?.trim().toLowerCase();
  return !!user && !!allowed && user.email.trim().toLowerCase() === allowed;
}

export function requireUser(user: ChatGPTUser | null): ChatGPTUser {
  if (!user) throw new ApiError(401, "sign_in_required");
  return user;
}

export function requireOwner(user: ChatGPTUser | null): ChatGPTUser {
  if (!user) throw new ApiError(401, "sign_in_required");
  if (!isOwner(user)) throw new ApiError(403, "owner_access_required");
  return user;
}

export async function syncUser(db: D1Database, user: ChatGPTUser) {
  const timestamp = now();
  await db.prepare("INSERT INTO users (id,email,role,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,role=excluded.role,updated_at=excluded.updated_at")
    .bind(user.userId, user.email, isOwner(user) ? "owner" : "customer", timestamp, timestamp).run();
}

function salePrice(original: number, id: number) {
  const rate = 20 + ((Math.imul(id | 0, 2654435761) >>> 0) % 11);
  const step = original < 1000 ? 10 : 100;
  const min = Math.ceil(original * .7 / step) * step;
  const max = Math.floor(original * .8 / step) * step;
  const rounded = Math.round(original * (100 - rate) / 100 / step) * step;
  return Math.max(step, Math.min(max, Math.max(min, rounded)));
}

export function currentPrice(original: number, minPrice: number, closingAt: number, timestamp = now()) {
  const minutes = (closingAt - timestamp) / 60000;
  const rate = minutes > 120 ? 10 : minutes > 60 ? 20 : 35;
  return { price: Math.min(original, Math.max(minPrice, Math.round(original * (100 - rate) / 100))), discountRate: rate };
}

export async function ensureSeed(db: D1Database) {
  const first = await db.prepare("SELECT id FROM shops LIMIT 1").first<Row>();
  if (!first) {
    const date = today(), timestamp = now();
    const statements: D1PreparedStatement[] = [];
    for (const shop of seedData.shops) {
      statements.push(db.prepare("INSERT OR IGNORE INTO shops (id,owner_user_id,name,category,area,address,lat,lng,image,sample,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(shop.id, null, shop.name, shop.category || null, shop.area, shop.address, shop.lat, shop.lng, shop.image, 1, timestamp));
    }
    for (const [id, shopId, name, originalPrice, , image, description] of seedData.menus) {
      const category = seedData.shops.find(shop => shop.id === shopId)?.category;
      const closing = category ? (id % 3 === 0 ? "20:00" : "21:00") : "18:00";
      statements.push(db.prepare("INSERT OR IGNORE INTO products (id,shop_id,name,description,original_price,price,min_price,image,surplus_reason,listing_date,closing_label,closing_at,status,sample,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(String(id), shopId, name, description, originalPrice, originalPrice, Math.round(originalPrice * .65 / 10) * 10, `assets/${image}.jpg`, "오늘 준비한 여분", date, closing, closingMillis(date, closing), "active", 1, timestamp - id * 60000, timestamp));
    }
    await db.batch(statements);
  }
  // Bring previously deployed fictional shops and inventory in line with the current demo fixtures.
  const previousArea: Record<string, string> = { yeonnam: "연남", mangwon: "망원", euljiro: "을지로", ikseon: "익선", gwanghwa: "광화문", itaewon: "이태원", hannam: "한남", yeouido: "여의도", gangnam: "강남" };
  const moved = seedData.shops.filter(shop => Object.hasOwn(previousArea, shop.id));
  const existingMoved = await db.prepare("SELECT area FROM shops WHERE id=?").bind(moved[0].id).first<Row>();
  if (existingMoved?.area !== "성수동") {
    const changes: D1PreparedStatement[] = [];
    for (const shop of moved) {
      changes.push(db.prepare("UPDATE shops SET name=?,area=?,address=?,lat=?,lng=? WHERE id=? AND sample=1")
        .bind(shop.name, shop.area, shop.address, shop.lat, shop.lng, shop.id));
      const oldArea = previousArea[shop.id];
      changes.push(db.prepare("UPDATE products SET name=REPLACE(name,?,?),description=REPLACE(description,?,?) WHERE shop_id=? AND sample=1")
        .bind(oldArea, "성수", oldArea, "성수", shop.id));
    }
    await db.batch(changes);
  }
  const date = today();
  await db.prepare("UPDATE products SET listing_date=?,closing_at=CAST(strftime('%s', ? || 'T' || closing_label || ':00+09:00') AS INTEGER)*1000,status=CASE WHEN status='hidden' THEN 'hidden' ELSE 'active' END,updated_at=? WHERE sample=1 AND (listing_date<>? OR closing_at>410244480000)")
    .bind(date, date, now(), date).run();
}

export function productForClient(row: Row) {
  const current = currentPrice(Number(row.original_price), Number(row.min_price || 0), Number(row.closing_at));
  return {
    id: Number(row.id), shop: row.shop_id, name: row.name, originalPrice: row.original_price, price: current.price, minPrice: row.min_price,
    status: row.status, closingAt: row.closing_at, discountRate: current.discountRate,
    reservable: row.status === "active" && Number(row.closing_at) > now(),
    image: row.image, desc: row.description, surplusReason: row.surplus_reason,
    closing: row.closing_label, date: row.listing_date, publishedAt: row.created_at, sample: Boolean(row.sample), likes: row.like_count || 0,
  };
}

export function shopForClient(row: Row) {
  return { id: row.id, name: row.name, category: row.category, area: row.area, address: row.address, lat: row.lat, lng: row.lng, image: row.image, acceptsVoucher: Boolean(row.accepts_voucher) };
}

export function discountPrice(original: number, id: number) { return salePrice(original, id); }

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
  const z = Math.sin(x / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.code, message: error.message }, error.status);
  console.error("Marketplace API failed", error);
  return json({ error: "server_error" }, 500);
}
