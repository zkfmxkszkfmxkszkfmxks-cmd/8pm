import { getChatGPTUser } from "@/app/chatgpt-auth";
import { geminiJson } from "@/lib/gemini";
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

function fallbackProposals(candidates: Row[], prompt: string) {
  const coffeeExcluded = /커피.{0,6}(빼|제외|없이)|카페인.{0,6}(빼|제외|없이)/.test(prompt);
  const kind = (product: Row) => /커피|라테|콜드브루|주스|음료/.test(product.name) ? "drink"
    : /스콘|크루아상|휘낭시에|소금빵|디저트/.test(product.name) ? "dessert" : "meal";
  const pairs: Array<{ products: Row[]; score: number; reason: string }> = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const first = candidates[i], second = candidates[j];
    if (first.shop_id === second.shop_id || (coffeeExcluded && [first, second].some(p => /커피|라테|콜드브루/.test(p.name)))) continue;
    const types = [kind(first), kind(second)];
    const score = (types.includes("meal") && types.includes("drink") ? 20 : types.includes("meal") && types.includes("dessert") ? 12 : types[0] !== types[1] ? 8 : 0)
      + (/샌드위치/.test(first.name + second.name) && /커피|라테|콜드브루/.test(first.name + second.name) ? 10 : 0)
      - distanceKm({ lat: Number(first.lat), lng: Number(first.lng) }, { lat: Number(second.lat), lng: Number(second.lng) }) * 10;
    const reason = types.includes("meal") && types.includes("drink") ? "든든한 식사에 시원한 음료를 곁들이기 좋은 조합이에요."
      : types.includes("meal") && types.includes("dessert") ? "식사 뒤 달콤한 디저트까지 즐길 수 있어요."
      : "서로 다른 두 가게의 메뉴를 함께 즐기기 좋은 조합이에요.";
    pairs.push({ products: [first, second], score, reason });
  }
  return pairs.sort((a, b) => b.score - a.score).slice(0, 40);
}

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
    const catalog = candidates.map(p => ({ id: String(p.id), name: p.name, category: p.category || "음식", description: p.description, shop: p.shop_name }));
    let parsed: { budget: number | null; sets: Array<{ productIds: string[]; reason: string }> } = { budget: null, sets: [] };
    try {
      parsed = await geminiJson<typeof parsed>(
        "고객 요청에 맞춰 함께 먹기 좋은 두 상품 조합을 최대 3개 제안하세요. 제공된 상품 ID만 사용하고 반드시 서로 다른 가게의 상품 두 개를 고르세요. 맛의 조화와 고객 조건을 근거로 각 조합의 이유를 한국어 한 문장으로 쓰세요. 상품이나 가게를 만들어내지 마세요. budget은 고객이 명시한 총 예산(원)만 숫자로, 없으면 null로 반환하세요.",
        { request: prompt, catalog }, schema,
      );
    } catch (error) {
      console.error("Using catalog-based set recommendation", { cause: error instanceof Error ? error.message : "unknown" });
    }
    const allowed = new Map(candidates.map(p => [String(p.id), p]));
    const seen = new Set<string>(), sets = [];
    const proposals = (parsed.sets || []).concat(fallbackProposals(candidates, prompt).map(pair => ({ productIds: pair.products.map(p => String(p.id)), reason: pair.reason })));
    for (const proposal of proposals) {
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
