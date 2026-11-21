import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ApiError, currentPrice, database, distanceKm, ensureSeed, errorResponse, json, now, requireUser, syncUser, today } from "@/lib/marketplace";
import { availableProduct, reservationPlan } from "@/lib/reservations";

export const runtime = "edge";
type Row = Record<string, any>;
type Origin = { lat: number; lng: number };
const schema = { type: "object", properties: {
  budget: { type: ["integer", "null"] },
  sets: { type: "array", items: { type: "object", properties: {
    productIds: { type: "array", items: { type: "string" } }, reason: { type: "string" },
  }, required: ["productIds", "reason"], additionalProperties: false } },
}, required: ["budget", "sets"], additionalProperties: false };

function validOrigin(origin: Origin) {
  return Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && origin.lat >= 33 && origin.lat <= 39 && origin.lng >= 124 && origin.lng <= 132;
}
const voucherEligible = (product: Row) => Boolean(product.accepts_voucher) && product.area === "성수동";

function presentSet(id: string, reason: string, products: Row[], origin: Origin, timestamp: number, voucherCode: string | null) {
  if (products.length !== 2 || products[0].shop_id === products[1].shop_id || products.some(p => !availableProduct(p, timestamp))) return null;
  if (products.some(p => distanceKm(origin, { lat: Number(p.lat), lng: Number(p.lng) }) > 3)) return null;
  if (voucherCode && (voucherCode !== "seongdong" || !products.every(voucherEligible))) return null;
  let visits;
  try { visits = reservationPlan(products, products.map(p => ({ id: p.shop_id, lat: p.lat, lng: p.lng })), origin, timestamp); }
  catch { return null; }
  const entries = products.map(p => ({ id: Number(p.id), quantity: 1, name: p.name, shopId: p.shop_id, shopName: p.shop_name,
    image: p.image, price: currentPrice(Number(p.original_price), Number(p.min_price || 0), Number(p.closing_at), timestamp).price,
    closingAt: p.closing_at, acceptsVoucher: voucherEligible(p) }));
  return { id, name: entries.map(p => p.name).join(" + "), reason, total: entries.reduce((sum, p) => sum + p.price * p.quantity, 0),
    voucherCode, voucherAvailable: entries.every(p => p.acceptsVoucher), useVoucher: Boolean(voucherCode), products: entries,
    visits: visits.map(v => ({ shopId: v.shop.id, etaAt: v.etaAt, closingAt: v.closingAt })) };
}

export async function GET(request: Request) {
  try {
    const user = requireUser(await getChatGPTUser());
    const url = new URL(request.url), origin = { lat: Number(url.searchParams.get("lat")), lng: Number(url.searchParams.get("lng")) };
    const voucherCode = url.searchParams.get("voucherCode") || null;
    if (!validOrigin(origin) || (voucherCode && voucherCode !== "seongdong")) throw new ApiError(400, "invalid_input");
    const db = database(); await ensureSeed(db); await syncUser(db, user);
    const timestamp = now();
    const saved = await db.prepare("SELECT * FROM recommendations WHERE customer_user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 20")
      .bind(user.userId, timestamp).all<Row>();
    const sets = [];
    for (const recommendation of saved.results) {
      if (voucherCode && recommendation.voucher_code !== voucherCode) continue;
      const components = JSON.parse(recommendation.items_json || "[]") as Array<{ productId: string; quantity: number }>;
      const ids = components.length ? components.map(item => String(item.productId)) : JSON.parse(recommendation.product_ids).map(String);
      if (ids.length !== 2 || (components.length && components.some(item => item.quantity !== 1))) continue;
      const products = [];
      for (const id of ids) {
        const product = await db.prepare("SELECT p.*,s.name AS shop_name,s.category,s.area,s.lat,s.lng,s.accepts_voucher FROM products p JOIN shops s ON s.id=p.shop_id WHERE p.id=?")
          .bind(id).first<Row>();
        if (product) products.push(product);
      }
      const set = presentSet(recommendation.id, recommendation.reason, products, origin, timestamp, recommendation.voucher_code);
      if (set) sets.push(set);
      if (sets.length >= 3) break;
    }
    return json({ sets });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = requireUser(await getChatGPTUser());
    const body = await request.json() as Row;
    const prompt = String(body.text || "").trim().slice(0, 300);
    const origin = { lat: Number(body.origin?.lat), lng: Number(body.origin?.lng) };
    const voucherCode = body.voucherCode || (body.useVoucher ? "seongdong" : null);
    if (!prompt || !validOrigin(origin) || (voucherCode && voucherCode !== "seongdong")) throw new ApiError(400, "invalid_input");
    const db = database(); await ensureSeed(db); await syncUser(db, user);
    const rows = await db.prepare("SELECT p.*,s.name AS shop_name,s.category,s.area,s.lat,s.lng,s.accepts_voucher FROM products p JOIN shops s ON s.id=p.shop_id WHERE p.status='active' AND p.listing_date=? ORDER BY p.created_at DESC LIMIT 150")
      .bind(today()).all<Row>();
    const timestamp = now();
    const candidates = rows.results.filter(p => availableProduct(p, timestamp) && distanceKm(origin, { lat: Number(p.lat), lng: Number(p.lng) }) <= 3 && (!voucherCode || voucherEligible(p))).slice(0, 60);
    if (new Set(candidates.map(p => p.shop_id)).size < 2) return json({ sets: [], message: "eligible_products_missing" });
    const runtimeEnv = env as unknown as { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };
    if (!runtimeEnv.OPENAI_API_KEY) throw new ApiError(503, "api_key_not_configured");
    const catalog = candidates.map(p => ({ id: String(p.id), name: p.name, category: p.category || "음식", description: p.description, shop: p.shop_name }));
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST",
      headers: { Authorization: `Bearer ${runtimeEnv.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: runtimeEnv.OPENAI_MODEL || "gpt-4o-mini", store: false, max_output_tokens: 800,
        input: [{ role: "system", content: "고객 요청에 맞춰 함께 먹기 좋은 두 상품 조합을 최대 3개 제안하세요. 제공된 상품 ID만 사용하고 반드시 서로 다른 가게의 상품 두 개를 고르세요. 맛의 조화와 고객 조건을 근거로 각 조합의 이유를 한국어 한 문장으로 쓰세요. 상품이나 가게를 만들어내지 마세요. budget은 고객이 명시한 총 예산(원)만 숫자로, 없으면 null로 반환하세요." },
          { role: "user", content: JSON.stringify({ request: prompt, catalog }) }],
        text: { format: { type: "json_schema", name: "menu_sets", strict: true, schema } } }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new ApiError(502, "ai_service_unavailable");
    const data = await response.json() as { status?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
    const output = data.output?.flatMap(item => item.type === "message" ? item.content || [] : []).find(part => part.type === "output_text")?.text;
    if (data.status !== "completed" || !output) throw new ApiError(502, "ai_response_incomplete");
    const parsed = JSON.parse(output) as { budget: number | null; sets: Array<{ productIds: string[]; reason: string }> };
    const allowed = new Map(candidates.map(p => [String(p.id), p]));
    const seen = new Set<string>(), sets = [];
    for (const proposal of parsed.sets || []) {
      if (!Array.isArray(proposal.productIds) || proposal.productIds.length !== 2) continue;
      const ids = proposal.productIds.map(String), key = [...ids].sort().join(":");
      const products = ids.map(id => allowed.get(id)).filter(Boolean) as Row[];
      if (seen.has(key) || products.length !== 2) continue;
      const reason = String(proposal.reason || "").trim().slice(0, 140);
      if (!reason) continue;
      const id = crypto.randomUUID(), set = presentSet(id, reason, products, origin, timestamp, voucherCode);
      if (!set || (Number.isInteger(parsed.budget) && parsed.budget! >= 100 && set.total > parsed.budget!)) continue;
      await db.prepare("INSERT INTO recommendations (id,customer_user_id,product_ids,items_json,voucher_code,reason,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, user.userId, JSON.stringify(ids), JSON.stringify(ids.map(productId => ({ productId, quantity: 1 }))), voucherCode, reason, timestamp, timestamp + 10 * 60_000).run();
      sets.push(set); seen.add(key);
      if (sets.length >= 3) break;
    }
    return json({ sets });
  } catch (error) { return errorResponse(error); }
}
