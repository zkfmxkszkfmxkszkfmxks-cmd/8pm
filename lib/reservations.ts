import { ApiError, currentPrice, distanceKm, now, today } from "./marketplace";

type Row = Record<string, any>;
const point = (row: Row) => ({ lat: Number(row.lat), lng: Number(row.lng) });
export const RESPONSE_WINDOW_MS = 5 * 60_000;
const WALK_KM_PER_MINUTE = 4.5 / 60;
const WALK_ROUTE_FACTOR = 1.3;

export function walkMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.ceil(distanceKm(a, b) * WALK_ROUTE_FACTOR / WALK_KM_PER_MINUTE);
}

export function reservationPlan(products: Row[], shops: Row[], origin: { lat: number; lng: number }, timestamp = now()) {
  if (!products.length || shops.length !== new Set(products.map(p => p.shop_id)).size) throw new ApiError(400, "invalid_set");
  if (shops.length === 2 && walkMinutes(point(shops[0]), point(shops[1])) > 10) throw new ApiError(409, "shops_too_far");
  const options = shops.length === 2 ? [shops, [shops[1], shops[0]]] : [shops];
  const plans = options.map(order => {
    let position = origin, minutes = 5;
    const stops = order.map(shop => {
      minutes += walkMinutes(position, point(shop));
      position = point(shop);
      const closingAt = Math.min(...products.filter(p => p.shop_id === shop.id).map(p => Number(p.closing_at)));
      return { shop, etaAt: timestamp + minutes * 60_000, closingAt };
    });
    return { stops, totalMinutes: minutes };
  }).filter(plan => plan.stops.every(stop => stop.etaAt <= stop.closingAt));
  plans.sort((a, b) => a.totalMinutes - b.totalMinutes);
  if (!plans.length) throw new ApiError(409, "pickup_time_unavailable");
  return plans[0].stops;
}

export function availableProduct(product: Row, timestamp = now()) {
  return product.status === "active" && product.listing_date === today() && Number(product.closing_at) > timestamp;
}

export function pricedProduct(product: Row, timestamp = now()) {
  return { ...product, current_price: currentPrice(Number(product.original_price), Number(product.min_price || 0), Number(product.closing_at), timestamp).price };
}

export async function syncOrderState(db: D1Database, orderId: string, timestamp = now()) {
  const pickups = await db.prepare("SELECT status FROM order_pickups WHERE order_id=?").bind(orderId).all<Row>();
  const statuses = pickups.results.map(row => row.status);
  const status = statuses.includes("sold_out") || statuses.includes("cancelled") ? "sold_out"
    : statuses.includes("timeout") ? "timeout"
    : statuses.includes("no_show") ? "no_show"
    : statuses.length > 0 && statuses.every(value => value === "completed") ? "completed"
    : statuses.length > 0 && statuses.every(value => value === "accepted" || value === "completed") ? "confirmed" : "waiting";
  await db.prepare("UPDATE orders SET status=?,confirmed_at=CASE WHEN ?='confirmed' AND confirmed_at IS NULL THEN ? ELSE confirmed_at END WHERE id=?")
    .bind(status, status, timestamp, orderId).run();
  return status;
}

export async function reconcileReservations(db: D1Database, timestamp = now()) {
  await db.prepare("UPDATE order_pickups SET response_status=CASE status WHEN 'accepted' THEN 'accepted' WHEN 'completed' THEN 'accepted' WHEN 'sold_out' THEN 'sold_out' WHEN 'timeout' THEN 'timeout' WHEN 'cancelled' THEN 'cancelled' ELSE response_status END WHERE response_status='waiting' AND status<>'waiting'").run();
  await db.prepare("UPDATE order_pickups SET receipt_status=CASE status WHEN 'completed' THEN 'completed' WHEN 'no_show' THEN 'no_show' ELSE receipt_status END WHERE receipt_status='pending' AND status IN ('completed','no_show')").run();
  await db.prepare(`UPDATE order_pickups SET status='timeout',response_status=CASE WHEN response_status='waiting' THEN 'timeout' ELSE response_status END WHERE status IN ('waiting','accepted') AND order_id IN (
    SELECT o.id FROM orders o JOIN order_pickups p ON p.order_id=o.id
    WHERE o.response_deadline_at IS NOT NULL AND o.response_deadline_at<=? AND p.status='waiting'
  )`).bind(timestamp).run();
  await db.prepare(`UPDATE order_pickups SET status='no_show',receipt_status='no_show' WHERE status IN ('accepted','ready') AND pickup_deadline_at IS NOT NULL AND pickup_deadline_at<=?
    AND NOT EXISTS (SELECT 1 FROM order_pickups other WHERE other.order_id=order_pickups.order_id AND other.status='waiting')`).bind(timestamp).run();
  const active = await db.prepare("SELECT id FROM orders WHERE response_deadline_at IS NOT NULL AND status IN ('waiting','confirmed') ORDER BY created_at DESC LIMIT 200").all<Row>();
  for (const order of active.results) await syncOrderState(db, String(order.id), timestamp);
}

export async function createReservation(db: D1Database, userId: string, body: Row, timestamp = now()) {
  const ids = Array.isArray(body.productIds) ? body.productIds.map(String) : [];
  if (!ids.length || ids.length > 2 || new Set(ids).size !== ids.length || ids.some(id => !/^\d+$/.test(id))) throw new ApiError(400, "invalid_items");
  const origin = { lat: Number(body.origin?.lat), lng: Number(body.origin?.lng) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || origin.lat < 33 || origin.lat > 39 || origin.lng < 124 || origin.lng > 132) throw new ApiError(400, "invalid_location");
  const products: Row[] = [];
  for (const id of ids) {
    const row = await db.prepare("SELECT * FROM products WHERE id=?").bind(id).first<Row>();
    if (!row || !availableProduct(row, timestamp)) throw new ApiError(409, "product_unavailable");
    products.push(pricedProduct(row, timestamp));
  }
  const shops: Row[] = [];
  for (const p of products) {
    const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(p.shop_id).first<Row>();
    if (!shop) throw new ApiError(404, "shop_not_found");
    shops.push(shop);
  }
  if (body.voucherCode && body.voucherCode !== "seongdong") throw new ApiError(400, "invalid_voucher");
  if ((body.useVoucher || body.voucherCode) && !shops.every(shop => Boolean(shop.accepts_voucher) && (!body.voucherCode || shop.area === "성수동"))) throw new ApiError(409, "voucher_unavailable");
  let recommendationId: string | null = null;
  if (ids.length === 2) {
    recommendationId = String(body.recommendationId || "");
    const recommendation = await db.prepare("SELECT * FROM recommendations WHERE id=? AND customer_user_id=? AND expires_at>?").bind(recommendationId, userId, timestamp).first<Row>();
    const components = recommendation ? JSON.parse(recommendation.items_json || "[]") : [];
    const storedIds = components.length ? components.map((item: Row) => String(item.productId)) : recommendation ? JSON.parse(recommendation.product_ids).map(String) : [];
    if (!recommendation || JSON.stringify([...storedIds].sort()) !== JSON.stringify([...ids].sort()) || components.some((item: Row) => Number(item.quantity) !== 1)) throw new ApiError(409, "recommendation_expired");
    if (recommendation.voucher_code && body.voucherCode !== recommendation.voucher_code) throw new ApiError(409, "voucher_unavailable");
  }
  const stops = reservationPlan(products, shops, origin, timestamp);
  const orderId = String(timestamp * 1000 + Math.floor(Math.random() * 1000));
  const subtotal = products.reduce((sum, p) => sum + p.current_price, 0);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const statements: D1PreparedStatement[] = [db.prepare("INSERT INTO orders (id,customer_user_id,subtotal,set_discount,total,payment_method,use_voucher,origin_lat,origin_lng,requested_at,response_deadline_at,status,recommendation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(orderId, userId, subtotal, 0, subtotal, "onsite", body.useVoucher ? 1 : 0, origin.lat, origin.lng, timestamp, timestamp + RESPONSE_WINDOW_MS, "waiting", recommendationId, timestamp)];
  products.forEach(product => statements.push(db.prepare("INSERT INTO order_items (order_id,product_id,shop_id,name,quantity,unit_price,set_discount) VALUES (?,?,?,?,?,?,?)")
    .bind(orderId, product.id, product.shop_id, product.name, 1, product.current_price, 0)));
  stops.forEach((stop, index) => statements.push(db.prepare("INSERT INTO order_pickups (order_id,shop_id,sequence,status,eta_at,pickup_deadline_at,pickup_code,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(orderId, stop.shop.id, index + 1, "waiting", stop.etaAt, stop.closingAt, code, timestamp)));
  await db.batch(statements);
  return { orderId: Number(orderId) };
}

export async function ownerReservationResponse(db: D1Database, orderId: string, shopId: string, action: "accepted" | "sold_out" | "completed", timestamp = now()) {
  await reconcileReservations(db, timestamp);
  const pickup = await db.prepare("SELECT * FROM order_pickups WHERE order_id=? AND shop_id=?").bind(orderId, shopId).first<Row>();
  if (!pickup) throw new ApiError(404, "order_not_found");
  const order = await db.prepare("SELECT response_deadline_at FROM orders WHERE id=?").bind(orderId).first<Row>();
  if (action === "accepted" || action === "sold_out") {
    if (pickup.status !== "waiting" || !order || Number(order.response_deadline_at) <= timestamp) throw new ApiError(409, "response_window_closed");
    const changed = await db.prepare("UPDATE order_pickups SET status=?,response_status=?,responded_at=? WHERE order_id=? AND shop_id=? AND status='waiting'").bind(action, action, timestamp, orderId, shopId).run();
    if (!changed.meta.changes) throw new ApiError(409, "response_already_recorded");
    if (action === "sold_out") {
      await db.prepare("UPDATE products SET status='sold_out',updated_at=? WHERE id IN (SELECT product_id FROM order_items WHERE order_id=? AND shop_id=?)").bind(timestamp, orderId, shopId).run();
      await db.prepare("UPDATE order_pickups SET status='cancelled',response_status=CASE WHEN response_status='waiting' THEN 'cancelled' ELSE response_status END WHERE order_id=? AND shop_id<>? AND status IN ('waiting','accepted')").bind(orderId, shopId).run();
    }
    await syncOrderState(db, orderId, timestamp);
    return;
  }
  if (pickup.status !== "accepted" || Number(pickup.pickup_deadline_at) <= timestamp) throw new ApiError(409, "pickup_unavailable");
  const pending = await db.prepare("SELECT 1 FROM order_pickups WHERE order_id=? AND status<>'accepted' AND status<>'completed' LIMIT 1").bind(orderId).first();
  if (pending) throw new ApiError(409, "other_shop_pending");
  const changed = await db.prepare("UPDATE order_pickups SET status='completed',receipt_status='completed',completed_at=?,received_at=? WHERE order_id=? AND shop_id=? AND status='accepted'").bind(timestamp, timestamp, orderId, shopId).run();
  if (!changed.meta.changes) throw new ApiError(409, "pickup_already_recorded");
  await syncOrderState(db, orderId, timestamp);
}
