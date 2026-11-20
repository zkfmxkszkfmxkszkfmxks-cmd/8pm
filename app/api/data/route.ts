import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ApiError, closingMillis, database, discountPrice, distanceKm, ensureSeed, errorResponse, isOwner, json, now, productForClient, requireOwner, requireUser, shopForClient, syncUser, today } from "@/lib/marketplace";

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
    const stops = pickups.results.map(s => ({ id: s.shop_id, name: s.name, area: s.area, address: s.address, lat: s.lat, lng: s.lng, pickup: new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(s.eta_at), status: s.status, items:items.results.filter(i=>i.shop_id===s.shop_id).map(i=>`${i.name} × ${i.quantity}`) }));
    result.push({ id: Number(row.id), date: new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"}).format(row.created_at), items: items.results.map(i => ({id:Number(i.product_id),shop:i.shop_id,name:i.name,qty:i.quantity,price:i.unit_price,setDiscount:i.set_discount})), subtotal:row.subtotal,setDiscount:row.set_discount,total:row.total,origin:{lat:row.origin_lat,lng:row.origin_lng},stops,status:owner?row.pickup_status:stops.every(s=>s.status==="completed")?"completed":stops[0]?.status||"waiting",completedAt:row.completed_at,sample:false });
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const db = database(); await ensureSeed(db);
    const user = await getChatGPTUser();
    const view = new URL(request.url).searchParams.get("view") || "catalog";
    if (view === "session") return json({ signedIn:!!user, owner:isOwner(user), displayName:user?.displayName||null });
    if (view === "catalog") {
      const [shops, products] = await Promise.all([
        db.prepare("SELECT * FROM shops ORDER BY created_at").all<Row>(),
        db.prepare("SELECT p.*,(SELECT COUNT(*) FROM likes l WHERE l.product_id=p.id) AS like_count FROM products p WHERE p.status='active' AND p.listing_date=? ORDER BY p.created_at DESC").bind(today()).all<Row>()
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
    const db=database(); await ensureSeed(db);
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
    if (action === "order") {
      const cart=Array.isArray(body.items)?body.items:[];
      if (!cart.length||cart.length>30) throw new ApiError(400,"invalid_items");
      const quantities=new Map<string,number>();
      for (const item of cart) {
        const productId=String(int(item.id)), qty=int(item.qty);
        if (!Number.isSafeInteger(Number(productId))||!Number.isSafeInteger(qty)||qty<1||qty>20) throw new ApiError(400,"invalid_items");
        quantities.set(productId,(quantities.get(productId)||0)+qty);
      }
      const products:Row[]=[];
      for (const [productId,qty] of quantities) {
        const row=await db.prepare("SELECT * FROM products WHERE id=? AND status='active' AND listing_date=?").bind(productId,today()).first<Row>();
        if (!row||row.stock<qty||(!row.sample&&row.closing_at<timestamp)) throw new ApiError(409,"stock_changed");
        products.push({...row,qty});
      }
      const subtotal=products.reduce((sum,p)=>sum+p.price*p.qty,0);
      const setQuantities=new Map<string,number>();
      for(const item of Array.isArray(body.setItems)?body.setItems:[]){const productId=String(int(item.id)),qty=int(item.qty);if(!Number.isSafeInteger(Number(productId))||!Number.isSafeInteger(qty)||qty<1)throw new ApiError(400,"invalid_set");setQuantities.set(productId,qty);}
      const setProducts=products.filter(p=>setQuantities.has(p.id));
      const validSet=setProducts.length>=2&&setProducts.length===setQuantities.size&&setProducts.every(p=>(setQuantities.get(p.id)||0)<=p.qty);
      const setSubtotal=validSet?setProducts.reduce((s,p)=>s+p.price*(setQuantities.get(p.id)||0),0):0;
      const setDiscount=validSet?Math.round(setSubtotal*.1/10)*10:0;
      const origin={lat:Number(body.origin?.lat),lng:Number(body.origin?.lng)};
      if (!Number.isFinite(origin.lat)||!Number.isFinite(origin.lng)||origin.lat<33||origin.lat>39||origin.lng<124||origin.lng>132) throw new ApiError(400,"invalid_location");
      const orderId=id(), pickupCode=String(Math.floor(100000+Math.random()*900000));
      const shopIds=[...new Set(products.map(p=>p.shop_id))];
      const shopRows:Row[]=[];
      for (const shopId of shopIds) {const shop=await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Row>();if(shop)shopRows.push(shop);}
      shopRows.sort((a,b)=>distanceKm(origin,{lat:Number(a.lat),lng:Number(a.lng)})-distanceKm(origin,{lat:Number(b.lat),lng:Number(b.lng)}));
      const statements:D1PreparedStatement[]=[db.prepare("INSERT INTO orders (id,customer_user_id,subtotal,set_discount,total,origin_lat,origin_lng,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(orderId,user.userId,subtotal,setDiscount,subtotal-setDiscount,origin.lat,origin.lng,timestamp)];
      let remainingDiscount=setDiscount;
      const lastEligible=setProducts.at(-1)?.id;
      for (let index=0;index<products.length;index++) {
        const p=products[index], discount=setQuantities.has(p.id)&&validSet?(p.id===lastEligible?remainingDiscount:Math.floor(setDiscount*p.price*(setQuantities.get(p.id)||0)/setSubtotal)):0;
        remainingDiscount-=discount;
        statements.push(db.prepare("UPDATE products SET stock=stock-?,updated_at=? WHERE id=?").bind(p.qty,timestamp,p.id));
        statements.push(db.prepare("INSERT INTO order_items (order_id,product_id,shop_id,name,quantity,unit_price,set_discount) VALUES (?,?,?,?,?,?,?)").bind(orderId,p.id,p.shop_id,p.name,p.qty,p.price,discount));
        statements.push(db.prepare("INSERT INTO inventory_movements (product_id,order_id,delta,reason,created_at) VALUES (?,?,?,?,?)").bind(p.id,orderId,-p.qty,"order",timestamp));
      }
      shopRows.forEach((s,index)=>statements.push(db.prepare("INSERT INTO order_pickups (order_id,shop_id,sequence,status,eta_at,pickup_code,created_at) VALUES (?,?,?,?,?,?,?)").bind(orderId,s.id,index+1,"waiting",timestamp+(15+index*12)*60000,pickupCode,timestamp)));
      await db.batch(statements);
      return json({orderId:Number(orderId)},201);
    }
    if (action === "hide-order") {
      const orderId=String(int(body.orderId));
      if (body.side === "owner") { requireOwner(user); const ownerShop=await selectedOwnerShop(db,body.shopId); await db.prepare("UPDATE order_pickups SET owner_hidden_at=? WHERE order_id=? AND shop_id=?").bind(timestamp,orderId,ownerShop).run(); }
      else await db.prepare("UPDATE orders SET customer_hidden_at=? WHERE id=? AND customer_user_id=?").bind(timestamp,orderId,user.userId).run();
      return json({ok:true});
    }
    if (action === "owner-status") {
      requireOwner(user);
      const ownerShop=await selectedOwnerShop(db,body.shopId);
      const orderId=String(int(body.orderId)), next=text(body.status,20);
      const current=await db.prepare("SELECT status FROM order_pickups WHERE order_id=? AND shop_id=?").bind(orderId,ownerShop).first<Row>();
      if (!current) throw new ApiError(404,"order_not_found");
      if ({waiting:"accepted",accepted:"ready",ready:"completed"}[current.status as "waiting"]!==next) throw new ApiError(409,"invalid_status_transition");
      await db.prepare("UPDATE order_pickups SET status=?,completed_at=? WHERE order_id=? AND shop_id=? AND status=?").bind(next,next==="completed"?timestamp:null,orderId,ownerShop,current.status).run();
      const order=await db.prepare("SELECT customer_user_id FROM orders WHERE id=?").bind(orderId).first<Row>();
      if(order) await db.prepare("INSERT INTO notifications (id,user_id,kind,title,body,order_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),order.customer_user_id,"order_status","주문 상태 변경",next==="ready"?"음식이 준비됐어요.":next==="completed"?"픽업이 완료됐어요.":"주문이 수락됐어요.",orderId,timestamp).run();
      return json({ok:true});
    }
    if (action === "product-create" || action === "product-update") {
      requireOwner(user);
      const ownerShop=await selectedOwnerShop(db,body.shopId);
      const name=text(body.name,40), description=text(body.description,300)||"마감 상품을 판매합니다", originalPrice=int(body.originalPrice), stock=int(body.stock), closing=text(body.closing,5);
      if (!name||!Number.isSafeInteger(originalPrice)||originalPrice<100||!Number.isSafeInteger(stock)||stock<0||stock>9999) throw new ApiError(400,"invalid_product");
      const closeAt=closingMillis(today(),closing);
      if(action==="product-create") {
        const productId=id(), image=text(body.image,300);
        if(!image.startsWith("/api/photos?key=")) throw new ApiError(400,"photo_required");
        await db.prepare("INSERT INTO products (id,shop_id,name,description,original_price,price,stock,initial_stock,image,surplus_reason,listing_date,closing_label,closing_at,status,sample,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(productId,ownerShop,name,description,originalPrice,discountPrice(originalPrice,Number(productId)),stock,stock,image,text(body.surplusReason,100),today(),closing,closeAt,"active",0,timestamp,timestamp).run();
        return json({productId:Number(productId)},201);
      }
      const productId=String(int(body.productId)), old=await db.prepare("SELECT stock FROM products WHERE id=? AND shop_id=?").bind(productId,ownerShop).first<Row>();
      if(!old) throw new ApiError(404,"product_not_found");
      await db.batch([
        db.prepare("UPDATE products SET name=?,description=?,original_price=?,price=?,stock=?,initial_stock=?,closing_label=?,closing_at=?,updated_at=? WHERE id=? AND shop_id=?").bind(name,description,originalPrice,discountPrice(originalPrice,Number(productId)),stock,stock,closing,closeAt,timestamp,productId,ownerShop),
        db.prepare("INSERT INTO inventory_movements (product_id,delta,reason,created_at) VALUES (?,?,?,?)").bind(productId,stock-old.stock,"owner_adjustment",timestamp)
      ]);
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
