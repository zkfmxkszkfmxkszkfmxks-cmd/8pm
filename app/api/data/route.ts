import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ApiError, closingMillis, currentPrice, database, ensureSeed, errorResponse, isOwner, json, now, productForClient, requireOwner, requireUser, shopForClient, syncUser, today } from "@/lib/marketplace";
import { createReservation, ownerReservationResponse, reconcileReservations } from "@/lib/reservations";

type Row = Record<string, any>;
const int = (value: unknown) => Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const id = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

async function selectedOwnerShop(db: D1Database, value: unknown) {
  const shopId=text(value,60);
  const exists=shopId&&await db.prepare("SELECT id FROM shops WHERE id=?").bind(shopId).first();
  if(!exists)throw new ApiError(400,"select_shop_first");
  return shopId;
}

async function orderRows(db: D1Database, userId: string, owner: boolean, ownerShop?: string) {
  const rows = owner
    ? await db.prepare("SELECT o.*, p.status AS pickup_status,p.eta_at,p.completed_at FROM orders o JOIN order_pickups p ON p.order_id=o.id WHERE p.shop_id=? AND p.owner_hidden_at IS NULL ORDER BY o.created_at DESC LIMIT 100").bind(ownerShop).all<Row>()
    : await db.prepare("SELECT * FROM orders WHERE customer_user_id=? AND customer_hidden_at IS NULL ORDER BY created_at DESC LIMIT 100").bind(userId).all<Row>();
  const result = [];
  for (const row of rows.results) {
    const items = await db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").bind(row.id).all<Row>();
    const pickups = await db.prepare("SELECT p.*,s.name,s.area,s.address,s.lat,s.lng FROM order_pickups p JOIN shops s ON s.id=p.shop_id WHERE p.order_id=? ORDER BY p.sequence").bind(row.id).all<Row>();
    const stops = pickups.results.map(s => ({ id: s.shop_id, name: s.name, area: s.area, address: s.address, lat: s.lat, lng: s.lng, pickup: new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(s.eta_at), status: s.status, responseStatus:s.response_status, receiptStatus:s.receipt_status, respondedAt:s.responded_at, pickupDeadlineAt:s.pickup_deadline_at, receivedAt:s.received_at, items:items.results.filter(i=>i.shop_id===s.shop_id).map(i=>`${i.name} × ${i.quantity}`) }));
    const statuses=stops.map(s=>s.status);
    const reservationStatus=statuses.includes("sold_out")||statuses.includes("cancelled")?"sold_out":statuses.includes("timeout")?"timeout":statuses.includes("no_show")?"no_show":statuses.every(s=>s==="completed")?"completed":statuses.every(s=>s==="accepted"||s==="completed")?"confirmed":"waiting";
    const recommendation=row.recommendation_id?await db.prepare("SELECT reason FROM recommendations WHERE id=?").bind(row.recommendation_id).first<Row>():null;
    result.push({ id: Number(row.id), date: new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"}).format(row.created_at), items: items.results.map(i => ({id:Number(i.product_id),shop:i.shop_id,name:i.name,qty:i.quantity,price:i.unit_price,setDiscount:i.set_discount})), subtotal:row.subtotal,setDiscount:row.set_discount,total:row.total,paymentMethod:row.payment_method||"onsite",useVoucher:Boolean(row.use_voucher),origin:{lat:row.origin_lat,lng:row.origin_lng},stops,status:owner?row.pickup_status:reservationStatus,reservationStatus:row.response_deadline_at?row.status:reservationStatus,requestedAt:row.requested_at||row.created_at,responseDeadlineAt:row.response_deadline_at,confirmedAt:row.confirmed_at,setId:row.recommendation_id,recommendationId:row.recommendation_id,recommendationReason:recommendation?.reason||null,completedAt:row.completed_at,sample:false });
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const db = database(); await ensureSeed(db); await reconcileReservations(db);
    const user = await getChatGPTUser();
    const view = new URL(request.url).searchParams.get("view") || "catalog";
    if (view === "session") return json({ signedIn:!!user, owner:isOwner(user), displayName:user?.displayName||null });
    if (view === "catalog") {
      const [shops, products] = await Promise.all([
        db.prepare("SELECT * FROM shops ORDER BY created_at").all<Row>(),
        db.prepare("SELECT p.*,(SELECT COUNT(*) FROM likes l WHERE l.product_id=p.id) AS like_count FROM products p WHERE p.status<>'hidden' AND p.listing_date=? ORDER BY p.created_at DESC").bind(today()).all<Row>()
      ]);
      return json({shops:shops.results.map(shopForClient),menus:products.results.map(productForClient),date:today()});
    }
    const signed = requireUser(user); await syncUser(db,signed);
    if (view === "likes") {
      const rows = await db.prepare("SELECT product_id FROM likes WHERE user_id=?").bind(signed.userId).all<Row>();
      return json({ids:rows.results.map(r=>Number(r.product_id))});
    }
    if (view === "orders") return json({orders:await orderRows(db,signed.userId,false)});
    if (view === "owner-orders") { requireOwner(user); return json({orders:await orderRows(db,signed.userId,true,await selectedOwnerShop(db,new URL(request.url).searchParams.get("shopId")))}); }
    if (view === "notifications") {
      const rows = await db.prepare("SELECT id,kind,title,body,order_id,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(signed.userId).all<Row>();
      return json({notifications:rows.results});
    }
    throw new ApiError(400,"invalid_view");
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const db=database(); await ensureSeed(db); await reconcileReservations(db);
    const user=requireUser(await getChatGPTUser()); await syncUser(db,user);
    const body=await request.json() as Row;
    const action=text(body.action,40), timestamp=now();
    if (action === "like") {
      const productId=String(int(body.productId));
      if (!Number.isFinite(Number(productId))) throw new ApiError(400,"invalid_product");
      const product=await db.prepare("SELECT id FROM products WHERE id=?").bind(productId).first();
      if (!product) throw new ApiError(404,"product_not_found");
      const previous=await db.prepare("SELECT 1 FROM likes WHERE user_id=? AND product_id=?").bind(user.userId,productId).first();
      if (previous) await db.prepare("DELETE FROM likes WHERE user_id=? AND product_id=?").bind(user.userId,productId).run();
      else await db.prepare("INSERT INTO likes (user_id,product_id,created_at) VALUES (?,?,?)").bind(user.userId,productId,timestamp).run();
      return json({liked:!previous});
    }
    if (action === "reservation-create") {
      const result = await createReservation(db, user.userId, body, timestamp);
      return json(result, 201);
    }
    if (action === "hide-order") {
      const orderId=String(int(body.orderId));
      if (body.side === "owner") { requireOwner(user); const ownerShop=await selectedOwnerShop(db,body.shopId); await db.prepare("UPDATE order_pickups SET owner_hidden_at=? WHERE order_id=? AND shop_id=?").bind(timestamp,orderId,ownerShop).run(); }
      else await db.prepare("UPDATE orders SET customer_hidden_at=? WHERE id=? AND customer_user_id=?").bind(timestamp,orderId,user.userId).run();
      return json({ok:true});
    }
    if (action === "hide-all-orders") {
      if(body.side === "owner") {
        requireOwner(user);
        const ownerShop=await selectedOwnerShop(db,body.shopId);
        const result=await db.prepare("UPDATE order_pickups SET owner_hidden_at=? WHERE shop_id=? AND owner_hidden_at IS NULL").bind(timestamp,ownerShop).run();
        return json({ok:true,count:result.meta.changes});
      }
      if(body.side === "customer") {
        const result=await db.prepare("UPDATE orders SET customer_hidden_at=? WHERE customer_user_id=? AND customer_hidden_at IS NULL").bind(timestamp,user.userId).run();
        return json({ok:true,count:result.meta.changes});
      }
      throw new ApiError(400,"invalid_order_side");
    }
    if (action === "owner-status") {
      requireOwner(user);
      const ownerShop=await selectedOwnerShop(db,body.shopId);
      const next=text(body.status,20);
      if(!["accepted","sold_out","completed"].includes(next)) throw new ApiError(400,"invalid_status");
      const orderId=String(int(body.orderId));
      await ownerReservationResponse(db,orderId,ownerShop,next as "accepted"|"sold_out"|"completed",timestamp);
      return json({ok:true});
    }
    if (action === "shop-voucher") {
      requireOwner(user);
      const ownerShop=await selectedOwnerShop(db,body.shopId);
      if(typeof body.acceptsVoucher!=="boolean")throw new ApiError(400,"invalid_voucher_setting");
      await db.prepare("UPDATE shops SET accepts_voucher=? WHERE id=?").bind(body.acceptsVoucher?1:0,ownerShop).run();
      return json({ok:true,acceptsVoucher:body.acceptsVoucher});
    }
    if (action === "product-status") {
      requireOwner(user);
      const ownerShop=await selectedOwnerShop(db,body.shopId);
      const productId=String(int(body.productId)), status=text(body.status,20);
      if(!["active","sold_out"].includes(status))throw new ApiError(400,"invalid_status");
      const changed=await db.prepare("UPDATE products SET status=?,updated_at=? WHERE id=? AND shop_id=?").bind(status,timestamp,productId,ownerShop).run();
      if(!changed.meta.changes)throw new ApiError(404,"product_not_found");
      return json({ok:true});
    }
    if (action === "product-create" || action === "product-update") {
      requireOwner(user);
      const ownerShop=await selectedOwnerShop(db,body.shopId);
      const name=text(body.name,40), description=text(body.description,300)||"마감 상품을 판매합니다";
      const originalPrice=int(body.originalPrice), minPrice=int(body.minPrice), closing=text(body.closing,5);
      if(!name||!Number.isSafeInteger(originalPrice)||originalPrice<100||!Number.isSafeInteger(minPrice)||minPrice<0||minPrice>originalPrice)throw new ApiError(400,"invalid_product");
      const closeAt=closingMillis(today(),closing);
      if(closeAt<=timestamp)throw new ApiError(400,"closing_time_passed");
      const price=currentPrice(originalPrice,minPrice,closeAt,timestamp).price;
      if(action==="product-create") {
        const productId=id(), image=text(body.image,300);
        if(!image.startsWith("/api/photos?key="))throw new ApiError(400,"photo_required");
        await db.prepare("INSERT INTO products (id,shop_id,name,description,original_price,price,min_price,image,surplus_reason,listing_date,closing_label,closing_at,status,sample,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(productId,ownerShop,name,description,originalPrice,price,minPrice,image,text(body.surplusReason,100),today(),closing,closeAt,"active",0,timestamp,timestamp).run();
        return json({productId:Number(productId)},201);
      }
      const productId=String(int(body.productId));
      const changed=await db.prepare("UPDATE products SET name=?,description=?,original_price=?,price=?,min_price=?,closing_label=?,closing_at=?,updated_at=? WHERE id=? AND shop_id=?")
        .bind(name,description,originalPrice,price,minPrice,closing,closeAt,timestamp,productId,ownerShop).run();
      if(!changed.meta.changes)throw new ApiError(404,"product_not_found");
      return json({ok:true});
    }
    if(action==="review") {
      const orderId=String(int(body.orderId)), shopId=text(body.shopId,60), rating=int(body.rating), review=text(body.body,500);
      if(rating<1||rating>5) throw new ApiError(400,"invalid_rating");
      const ordered=await db.prepare("SELECT 1 FROM orders o JOIN order_pickups p ON p.order_id=o.id WHERE o.id=? AND o.customer_user_id=? AND p.shop_id=? AND p.status='completed'").bind(orderId,user.userId,shopId).first();
      if(!ordered) throw new ApiError(403,"review_requires_pickup");
      await db.prepare("INSERT INTO reviews (id,order_id,shop_id,customer_user_id,rating,body,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,shopId,user.userId,rating,review,timestamp).run();
      return json({ok:true},201);
    }
    throw new ApiError(400,"invalid_action");
  } catch(error) { return errorResponse(error); }
}
