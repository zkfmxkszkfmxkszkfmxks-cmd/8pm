// Reservation experience shared by the customer and selected demo shop owner.
const reservationLabel = status => ({waiting:'응답 대기',accepted:'수락 · 다른 가게 응답 대기',confirmed:'픽업 확정',completed:'수령 완료',sold_out:'품절로 종료',cancelled:'품절로 종료',timeout:'응답 시간 초과',no_show:'픽업 미수령',ready:'픽업 확정'})[status] || '상태 확인 중';
const productAvailability = menu => menu.status === 'sold_out' ? '품절' : menu.reservable ? '예약 요청 가능' : '마감';
const deadlineText = time => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(Number(time));
const requestTimer = deadline => `<time class="reservation-timer" data-deadline="${Number(deadline)||0}">05:00</time>`;
const shopOrderTotal = (order,shopId) => order.items.filter(item=>item.shop===shopId).reduce((sum,item)=>sum+item.price*item.qty,0);
const customerResponseLabel = stop => stop.responseStatus==='sold_out'?'재고 부족':stop.status==='cancelled'?'요청 종료':stop.responseStatus==='accepted'?'수락':stop.responseStatus==='timeout'?'응답 시간 초과':'확인 중';
const customerReceiptLabel = stop => stop.receiptStatus==='completed'?'수령 완료':stop.receiptStatus==='no_show'?'미수령':['sold_out','cancelled','timeout'].includes(stop.status)?'수령 해당 없음':'수령 대기';
let featuredSets=[],featuredAttemptKey='',featuredLoading=false,featuredLastGeneratedAt=0,replacementData=null,replacementSelectedId=null;
const setCatalog=()=>[...featuredSets,...(Array.isArray(aiResult)?aiResult:[])].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index);
const setById=id=>setCatalog().find(item=>item.id===id);
const setProductImage=product=>esc(product.image?.startsWith('assets/')?product.image:product.image||'assets/croissant.jpg');
function featuredSetCard(set){
  return `<section class="featured-set" aria-label="오늘의 마감한끼"><div class="featured-set-head"><div><small>오늘의 마감한끼</small><p class="featured-set-intro">내 주변 가게에서 함께 먹기 좋은 메뉴를 조합해 추천해요.</p><h2>${esc(set.name||set.products.map(p=>p.name).join(' + '))}</h2></div><strong>${won(set.total)}</strong></div><div class="featured-set-products">${set.products.map(p=>`<div class="featured-set-product"><img src="${setProductImage(p)}" alt="${esc(p.name)} 사진" loading="lazy"><strong>${esc(p.name)}</strong><small>${esc(p.shopName)}</small><b>${won(p.price*p.quantity)}</b></div>`).join('')}</div><p class="featured-set-reason" title="${esc(set.reason)}">${esc(set.reason)}</p><p class="featured-set-meta">방문 순서 · ${set.visits.map((visit,index)=>`${index+1}. ${esc(shop(visit.shopId)?.name||'가게')}`).join(' → ')}</p><p class="featured-set-meta">픽업 마감 · ${set.products.map(p=>`${esc(p.shopName)} ${deadlineText(p.closingAt)}`).join(' · ')}</p><p class="featured-set-voucher">성동사랑상품권 ${set.voucherAvailable?'사용 가능':'두 가게 모두 사용 불가'}</p><div class="featured-set-actions"><button class="outline-button" data-action="set-list">전체 보기</button><button class="primary" data-action="set-detail" data-id="${esc(set.id)}">세트 보기</button></div></section>`;
}
state.cart=[];state.cartSet=null;persist();

productTile=function(menu){
  const liked=state.likes.includes(menu.id), availability=productAvailability(menu);
  return `<div class="shop-product"><button class="product-image-button" data-action="product-detail" data-id="${menu.id}" aria-label="${esc(menu.name)} 상세 보기"><img class="shop-product-photo" src="${image(menu)}" alt="${esc(menu.name)} 사진" loading="lazy"></button><div class="shop-product-body"><button class="product-name-button" data-action="product-detail" data-id="${menu.id}">${esc(menu.name)}</button><span class="shop-product-price"><b>${won(menu.price)}</b><del>${won(menu.originalPrice||menu.price)}</del></span><small class="shop-product-stock">${discountPercent(menu)}% 할인 · ${availability}</small><p class="shop-product-desc" title="${esc(menu.desc)}">${esc(menu.desc)}</p><div class="shop-product-actions"><button data-action="like" data-id="${menu.id}" class="shop-like ${liked?'liked':''}" aria-pressed="${liked}" aria-label="${esc(menu.name)} 좋아요">${liked?'♥':'♡'} <span>${(menu.likes||0)+(liked?1:0)}</span></button><button data-action="reserve-product" data-id="${menu.id}" class="shop-add" ${menu.reservable?'':'disabled'}>${menu.reservable?'예약하기':'예약 불가'}</button></div></div></div>`;
};

function productDetail(id){
  const menu=active().find(item=>item.id===Number(id));if(!menu)return;
  const store=shop(menu.shop);
  overlay(esc(menu.name),`<img class="sheet-cover" src="${image(menu)}" alt="${esc(menu.name)} 사진"><p class="muted">${esc(store.name)} · ${esc(store.area)}</p><p class="product-detail-price"><strong>${won(menu.price)}</strong> <del>${won(menu.originalPrice||menu.price)}</del></p><p>${esc(menu.desc)}</p><p class="reservation-availability">${productAvailability(menu)} · 픽업 마감 ${esc(menu.closing)}</p><button class="primary" data-action="reserve-product" data-id="${menu.id}" ${menu.reservable?'':'disabled'}>${menu.reservable?'예약하기':'예약 불가'}</button>`);
}

shopInfo=function(id){
  const store=shop(id);selectedShop=id;
  overlay(esc(store.name),`<img class="sheet-cover" src="assets/${esc(store.image)}.jpg" alt=""><div class="info-line">⌖ ${esc(store.address)} · ${esc(store.category||'골목 가게')} · ${distance(center(),store).toFixed(1)}km</div><h3>오늘의 메뉴</h3>${active().filter(menu=>menu.shop===id).map(menu=>`<div class="mini-item"><span>${esc(menu.name)}<small>${productAvailability(menu)} · 픽업 마감 ${esc(menu.closing)}</small></span><strong>${won(menu.price)}</strong><button class="outline-button" data-action="product-detail" data-id="${menu.id}">상세</button></div>`).join('')||'<p class="muted">오늘 등록된 메뉴가 없습니다.</p>'}<button class="primary" data-action="close">닫기</button>`);
};

const previousFeedPage=feedPage;
feedPage=function(){
  const content=previousFeedPage().replace('서울 전역의 가상 가게','시연용 가상 가게').replace(/가격과 재고는 서버에 저장됩니다\./,'예약 상태는 서버에 저장됩니다.').replace('최근 재고 등록 매장','최근 메뉴 등록 매장');
  return state.mode==='guest'&&featuredSets.length?content.replace('<div class="stories-heading">',featuredSetCard(featuredSets[0])+'<div class="stories-heading">'):content;
};
const previousStories=stories;
stories=function(){return previousStories().replaceAll('최근 재고 등록 매장','최근 메뉴 등록 매장');};

aiOpen=function(){overlay('골목세트',`<p class="muted">원하는 식사와 취향을 적으면 서로 다른 두 가게의 메뉴를 조합해 드려요.</p><p class="set-profile-note">${customerProfileNotes?`내 정보의 특이사항 반영 · ${esc(customerProfileNotes)}`:'내 정보에서 특이사항을 저장하면 추천에 자동 반영돼요.'}</p><textarea id="ai-prompt" rows="3" placeholder="예: 점심으로 샌드위치와 함께 먹을 음료 추천해줘">${esc(aiText)}</textarea><label class="voucher-select-label">상품권 조건<select id="set-voucher-code"><option value="">조건 없음</option><option value="seongdong">성동사랑상품권 · 두 가게 모두 사용 가능</option></select></label><button class="primary" data-action="ai-run">메뉴 조합 추천받기</button><p class="demo-note">AI는 등록된 상품만 고르고, 예약 가능 시간과 가게 간 이동은 서버에서 확인합니다.</p>`)};

aiRun=async function(){
  aiText=$('#ai-prompt')?.value.trim()||'';if(!aiText)return toast('원하는 메뉴를 설명해 주세요.');
  const voucherCode=$('#set-voucher-code')?.value||null, button=$('[data-action="ai-run"]');
  if(button){button.disabled=true;button.textContent='조합을 찾는 중...';}
  try{
    const response=await fetch('/api/ai/sets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:aiText,origin:feedLocation(),useVoucher:!!voucherCode,voucherCode})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'recommendation_failed');
    aiResult=data.sets||[];featuredSets=aiResult;render();
    showAiResult();
  }catch(error){toast(error.message==='api_key_not_configured'?'AI 연결을 준비 중입니다.':'추천을 불러오지 못했어요. 다시 시도해 주세요.');if(button&&button.isConnected){button.disabled=false;button.textContent='메뉴 조합 추천받기';}}
};

showAiResult=function(){
  const sets=setCatalog();
  overlay('골목세트 추천',`${sets.length?sets.map(set=>`<article class="reservation-set"><div class="reservation-set-top"><h3>${esc(set.name)}</h3><strong>${won(set.total)}</strong></div><p>${esc(set.reason)}</p>${set.products.map(p=>`<div class="reservation-set-item"><img src="${setProductImage(p)}" alt="${esc(p.name)} 사진"><span>${esc(p.shopName)} · ${esc(p.name)}<small>픽업 마감 ${deadlineText(p.closingAt)} · ${p.acceptsVoucher?'성동사랑상품권 사용 가능':'상품권 사용 불가'}</small></span><strong>${won(p.price*p.quantity)}</strong></div>`).join('')}<p class="muted">방문 순서: ${set.visits.map((v,i)=>`${i+1}. ${esc(shop(v.shopId).name)}`).join(' → ')}</p><button class="primary" data-action="set-detail" data-id="${esc(set.id)}">세트 보기</button></article>`).join(''):'<p class="muted">현재 조건과 픽업 시간에 맞는 조합이 없어요. 조건을 바꿔 다시 시도해 주세요.</p>'}<button class="outline-button full" data-action="ai-open">조건 다시 입력</button>`);
};

function showSetDetail(id){
  const set=setById(id);if(!set)return toast('추천 세트를 다시 불러와 주세요.');
  overlay('골목세트 상세',`<div class="set-detail-head"><h3>${esc(set.name)}</h3><strong>${won(set.total)}</strong></div><p class="featured-set-reason">${esc(set.reason)}</p><div class="featured-set-products">${set.products.map(p=>`<div class="featured-set-product"><img src="${setProductImage(p)}" alt="${esc(p.name)} 사진"><strong>${esc(p.name)}</strong><small>${esc(p.shopName)}</small><b>${won(p.price*p.quantity)}</b><small>픽업 마감 ${deadlineText(p.closingAt)}</small></div>`).join('')}</div><p class="featured-set-meta">추천 방문 순서 · ${set.visits.map((visit,index)=>`${index+1}. ${esc(shop(visit.shopId).name)} (${deadlineText(visit.etaAt)} 예상)`).join(' → ')}</p><p class="featured-set-voucher">성동사랑상품권 ${set.voucherAvailable?'사용 가능':'두 가게 모두 사용 불가'}</p><p class="muted">각 가게에서 요청 시점 단가로 현장 결제합니다.</p><button class="primary" data-action="reserve-set" data-id="${esc(set.id)}">세트 예약 요청</button><button class="outline-button full" data-action="set-list">전체 보기</button>`);
}

async function loadFeaturedSets(){
  if(!demoSession.signedIn||demoSession.role!=='customer'||featuredLoading)return;
  const origin=feedLocation(),key=`${day()}:${origin.lat.toFixed(4)}:${origin.lng.toFixed(4)}`;
  if(featuredAttemptKey===key)return;
  featuredAttemptKey=key;featuredLoading=true;
  try{
    let response=await fetch(`/api/ai/sets?lat=${encodeURIComponent(origin.lat)}&lng=${encodeURIComponent(origin.lng)}`,{cache:'no-store'});
    let data=await response.json();
    if(!response.ok)throw Error(data.error);
    if(!data.sets?.length&&Date.now()-featuredLastGeneratedAt>10*60_000){
      featuredLastGeneratedAt=Date.now();
      response=await fetch('/api/ai/sets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'오늘 함께 먹기 좋은 식사 메뉴와 음료 또는 간식을 두 가게에서 조합해줘',origin,useVoucher:false,voucherCode:null})});
      data=await response.json();
      if(!response.ok)throw Error(data.error);
    }
    featuredSets=data.sets||[];
    if(state.tab==='feed'&&state.mode==='guest')render();
  }catch{featuredSets=[];}
  finally{featuredLoading=false;}
}
document.addEventListener('marketplace-ready',()=>{if(demoSession.role==='customer')void loadFeaturedSets();else featuredSets=[];});
setInterval(()=>{if(document.visibilityState==='visible'&&demoSession.role==='customer'&&state.tab==='feed'){featuredAttemptKey='';void loadFeaturedSets();}},60_000);

const previousRegisterPage=registerPage;
registerPage=function(){return previousRegisterPage().replace('3개 남았고 ','').replace('남은 수량, ','').replace('재고가 생긴 이유, ','남은 이유와 ').replace('정가에서 20~30% 할인된','마감까지 남은 시간에 따라 할인된');};

draftView=function(){
  const suggestedMin=Number(draft.price)>0?Math.round(Number(draft.price)*.65/10)*10:0;
  overlay('등록 초안 확인',`<p class="muted">추출한 내용을 확인하고 필요한 부분을 고쳐 주세요.</p><img class="draft-photo" src="${photo}" alt="등록할 상품 사진"><form id="draft-form"><label class="form-label">상품 이름<input name="name" required maxlength="40" value="${esc(draft.name)}"></label><div class="form-grid"><label class="form-label">정가 (원)<input name="price" type="number" min="100" required value="${Number(draft.price)||''}"></label><label class="form-label">최저 판매가 (원)<input name="minPrice" type="number" min="0" required value="${suggestedMin||''}"></label></div><label class="form-label">픽업 마감시간<input name="closing" type="time" required value="${esc(draft.closing)}"></label><label class="form-label">상품 설명<textarea name="desc" rows="3" maxlength="300">${esc(draft.desc||'')}</textarea></label><p class="owner-draft-shop">등록 가게 · ${esc(shop(OWNER_SHOP_ID).name)}</p><p class="muted">마감 2시간 초과 10%, 1~2시간 20%, 1시간 이하 35% 할인. 최저 판매가 아래로는 내려가지 않습니다.</p><button class="primary" type="submit">확인하고 메뉴 등록하기</button></form>`);
};

edit=function(id){
  const menu=ownerMenus().find(item=>item.id===Number(id));if(!menu)return;
  overlay('메뉴 수정',`<form id="edit-form" data-id="${menu.id}"><label class="form-label">상품 이름<input name="name" required maxlength="40" value="${esc(menu.name)}"></label><div class="form-grid"><label class="form-label">정가 (원)<input name="price" type="number" min="100" required value="${menu.originalPrice||menu.price}"></label><label class="form-label">최저 판매가 (원)<input name="minPrice" type="number" min="0" required value="${menu.minPrice||0}"></label></div><label class="form-label">픽업 마감시간<input name="closing" type="time" required value="${esc(menu.closing||'18:00')}"></label><label class="form-label">상품 설명<textarea name="desc" rows="3" maxlength="300">${esc(menu.desc||'')}</textarea></label><p class="muted">현재 적용 판매가 ${won(menu.price)} · ${productAvailability(menu)}</p><button class="primary" type="submit">변경 저장</button></form>`);
};

managePage=function(){
  const store=shop(OWNER_SHOP_ID),accepts=!!store.acceptsVoucher;
  return `${heading('FOR SHOP OWNERS','등록 메뉴 관리',store.name+'의 판매 상태와 현재 가격을 확인하세요.')}${ownerBanner()}<section class="panel"><div class="panel-title"><h2>오늘의 메뉴</h2><span>${ownerMenus().length}개</span></div>${ownerMenus().map(menu=>`<div class="manage-item"><img src="${image(menu)}" alt=""><div><strong>${esc(menu.name)}</strong><small>정가 ${won(menu.originalPrice)} · 현재 적용 판매가 ${won(menu.price)} · 최저 ${won(menu.minPrice||0)} · ${productAvailability(menu)}</small></div><button class="outline-button" data-action="edit" data-id="${menu.id}">수정</button><button class="outline-button" data-action="product-status" data-id="${menu.id}" data-value="${menu.status==='sold_out'?'active':'sold_out'}">${menu.status==='sold_out'?'판매 재개':'품절 처리'}</button></div>`).join('')||'<p class="muted">오늘 등록된 메뉴가 없습니다.</p>'}</section><section class="panel voucher-settings"><div class="panel-title"><h2>가게 설정</h2></div><div class="voucher-settings-row"><div><strong>서울사랑상품권 사용</strong><p>손님 추천에 사용 가능 여부가 표시됩니다.</p></div><button type="button" data-action="voucher-toggle" role="switch" aria-checked="${accepts}" class="voucher-switch ${accepts?'on':''}"><span></span></button></div><small class="voucher-settings-state">현재 ${accepts?'사용 가능':'사용 불가'}</small></section>`;
};

ownerOrderCard=function(order){
  const status=order.status,items=order.items.filter(item=>item.shop===OWNER_SHOP_ID),localTotal=shopOrderTotal(order,OWNER_SHOP_ID);
  const end=['completed','sold_out','cancelled','timeout','no_show'].includes(status);
  const label=status==='accepted'&&order.reservationStatus==='confirmed'?'픽업 확정':status==='accepted'?'다른 가게 응답 대기':reservationLabel(status);
  const deadline=Number(order.responseDeadlineAt)||0;
  return `<article class="owner-order-card"><div class="owner-order-top"><strong>주문 #${orderNumber(order)}</strong><span class="owner-status ${esc(status)}">${label}</span></div><small>${esc(order.date)}</small><div class="owner-order-items">${orderItemRows(items)}</div><div class="order-price-total"><span>요청 시점 현장 결제 금액</span><strong>${won(localTotal)}</strong></div>${status==='waiting'?`<div class="owner-eta"><span>응답까지 남은 시간</span>${requestTimer(deadline)}</div><div class="reservation-actions"><button class="primary" data-action="reservation-response" data-id="${order.id}" data-value="accepted" ${deadline>Date.now()?'':'disabled'}>수락</button><button class="outline-button" data-action="reservation-response" data-id="${order.id}" data-value="sold_out" ${deadline>Date.now()?'':'disabled'}>품절</button></div>`:''}${status==='accepted'?`<p class="muted">${order.reservationStatus==='confirmed'?'고객이 각 가게에서 현장 결제 후 상품을 받으면 수령 완료를 누르세요.':'다른 가게의 응답을 기다리고 있어요.'}</p>${order.reservationStatus==='confirmed'?`<button class="primary" data-action="reservation-response" data-id="${order.id}" data-value="completed">수령 완료</button>`:''}`:''}${end?`<p class="muted">${reservationLabel(order.reservationStatus==='sold_out'?'sold_out':status)}</p>`:''}<button class="delete-order-button" data-action="delete-order" data-id="${order.id}">내역 삭제</button></article>`;
};

ownerOrdersPage=function(){
  const list=ownerOrders(),pending=list.filter(o=>o.status==='waiting'),accepted=list.filter(o=>['accepted','ready'].includes(o.status)),done=list.filter(o=>!pending.includes(o)&&!accepted.includes(o));
  const section=(title,items,empty)=>`<section class="panel"><div class="panel-title"><h2>${title}</h2><span>${items.length}건</span></div>${items.length?items.map(ownerOrderCard).join(''):`<p class="muted">${empty}</p>`}</section>`;
  return `${heading('FOR SHOP OWNERS','들어온 주문',`${esc(shop(OWNER_SHOP_ID).name)} 진행 중 ${pending.length}건 · 수락 ${accepted.length}건 · 완료 ${done.length}건`)}${ownerBanner()}${list.length?'<div class="order-bulk-actions"><button data-action="delete-all-orders" data-value="owner">전체 삭제</button></div>':''}${section('진행 중인 주문',pending,'응답을 기다리는 요청이 없습니다.')}${section('수락한 주문',accepted,'수락한 주문이 없습니다.')}${section('완료',done,'종료된 주문이 없습니다.')}<p class="demo-note">예약 요청은 5분 안에 응답해야 합니다. 결제는 고객이 각 가게에서 현장 결제합니다.</p>`;
};

async function openReplacement(orderId){
  await withServer(async()=>{
    const response=await fetch('/api/data?view=replacements&orderId='+encodeURIComponent(orderId),{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'replacement_unavailable');
    replacementData=data;replacementSelectedId=data.options[0]?.id||null;
    if(data.replacementOrderId){toast('이미 대체 예약을 요청했어요.');return;}
    overlay('품절 메뉴 안내',`<div class="replacement-alert-icon" aria-hidden="true">!</div><h3 class="replacement-alert-title">일부 메뉴가 품절되었어요</h3><p class="replacement-alert-copy">${esc(data.soldOut.name)}가 품절되어 다른 메뉴로 교체할 수 있어요.</p><div class="replacement-sold-row"><img src="${setProductImage(data.soldOut)}" alt=""><span><strong>${esc(data.soldOut.name)}</strong><small>${esc(data.soldOut.shopName)}</small></span><b>품절</b></div>${data.kept&&!data.kept.available?'<p class="replacement-notice">함께 예약한 메뉴도 현재 예약할 수 없어 처음부터 다시 골라 주세요.</p>':`<button class="outline-button full" data-action="replacement-choose" ${data.options.length?'':'disabled'}>이 메뉴만 다른 가게 상품으로 바꾸기</button>`}<button class="outline-button full" data-action="replacement-restart">처음부터 다시 고르기</button>${!data.options.length&&data.kept?.available?'<p class="replacement-notice">현재 조건에 맞는 가까운 대체 메뉴가 없어요.</p>':''}`);
  });
}

function showReplacementPicker(){
  if(!replacementData)return;
  const options=replacementData.options,selected=options.find(item=>item.id===replacementSelectedId)||options[0];
  if(!selected)return;
  const discount=Math.max(0,Math.round((1-selected.total/selected.originalTotal)*100));
  overlay('대체 메뉴 선택',`<p class="replacement-location">⌖ 가까운 가게의 유사 메뉴를 추천해드려요!</p><div class="replacement-options" role="radiogroup" aria-label="대체 메뉴">${options.map(item=>`<button class="replacement-option ${item.id===selected.id?'selected':''}" role="radio" aria-checked="${item.id===selected.id}" data-action="replacement-select" data-id="${item.id}"><img src="${setProductImage(item)}" alt="${esc(item.name)} 사진"><span><strong>${esc(item.name)}</strong><small>${esc(item.shopName)} · 픽업 마감 ${deadlineText(item.closingAt)}</small><b>${won(item.price)}</b></span><i aria-hidden="true"></i></button>`).join('')}</div>${replacementData.kept?`<p class="replacement-kept">함께 예약할 메뉴 · ${esc(replacementData.kept.name)}</p>`:''}<div class="replacement-total"><span>교체 후 현장 결제 합계</span><strong>${won(selected.total)}</strong><small>${discount}% 할인</small></div><p class="replacement-notice">적용하면 새 예약 요청을 보냅니다. 각 가게가 다시 확인한 뒤 확정돼요.</p><button class="primary full" data-action="replacement-apply">적용하기</button><button class="outline-button full" data-action="replacement-back">뒤로</button>`);
}

orderCard=function(order){
  const status=order.reservationStatus||order.status;
  return `<article class="order-card"><div class="order-top"><strong>주문 #${orderNumber(order)}</strong><span>${status==='sold_out'?'재고 부족으로 종료':reservationLabel(status)}</span></div>${order.recommendationReason?`<p>${esc(order.recommendationReason)}</p>`:''}<p class="reservation-order-time">요청 ${deadlineText(order.requestedAt)}${order.confirmedAt?` · 확정 ${deadlineText(order.confirmedAt)}`:''}</p>${order.stops.map(stop=>`<div class="reservation-shop-status"><strong>${esc(stop.name)}</strong><span>${customerResponseLabel(stop)}</span><small>${stop.items.map(esc).join(' · ')} · 현장 결제 ${won(shopOrderTotal(order,stop.id))}</small><small>픽업 기한 ${stop.pickupDeadlineAt?deadlineText(stop.pickupDeadlineAt):stop.pickup} · ${customerReceiptLabel(stop)}</small></div>`).join('')}<div class="order-price-total"><span>현장 결제 합계</span><strong>${won(order.total)}</strong></div>${status==='waiting'?'<p class="reservation-waiting-message">가게의 응답을 기다리고 있어요.</p>':''}${status==='sold_out'&&!order.replacementOrderId?`<button class="primary full replacement-start" data-action="replacement-open" data-id="${order.id}">다른 메뉴 추천받기</button>`:''}${order.replacementOrderId?'<p class="replacement-notice">대체 예약을 새로 요청했어요.</p>':''}${['confirmed','completed','no_show'].includes(status)?`<button class="outline-button full" data-action="route" data-id="${order.id}">픽업 순서 보기</button>`:''}<button class="delete-order-button" data-action="delete-order" data-id="${order.id}">내역 삭제</button></article>`;
};

ordersPage=function(){
  const visible=state.orders.filter(o=>!state.customerHiddenOrderIds.includes(o.id)),pending=visible.filter(o=>o.reservationStatus==='waiting'),confirmed=visible.filter(o=>o.reservationStatus==='confirmed'),done=visible.filter(o=>!pending.includes(o)&&!confirmed.includes(o));
  const section=(title,items)=>`<section class="panel"><div class="panel-title"><h2>${title}</h2><span>${items.length}건</span></div>${items.length?items.map(orderCard).join(''):'<p class="muted">표시할 주문이 없습니다.</p>'}</section>`;
  return `${heading('MY ALLEY','내 주문','가게별 응답과 수령 상태를 확인하세요.')}${visible.length?'<div class="order-bulk-actions"><button data-action="delete-all-orders" data-value="customer">전체 삭제</button></div>':''}${section('응답 대기',pending)}${section('픽업 확정',confirmed)}${section('완료',done)}`;
};

async function requestReservation(productIds,recommendationId,useVoucher,voucherCode=null){
  await withServer(async()=>{
    const result=await api('reservation-create',{productIds,recommendationId,useVoucher,voucherCode,origin:feedLocation()});
    close();state.tab='orders';await refreshServerData();toast(productIds.length===2?'예약 요청을 두 가게에 보냈어요.':'예약 요청을 보냈어요.');
    document.querySelector('.main')?.scrollIntoView({block:'start'});
  });
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(!['product-detail','reserve-product','reserve-set','set-list','set-detail','reservation-response','product-status','replacement-open','replacement-choose','replacement-select','replacement-apply','replacement-restart','replacement-back'].includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action==='replacement-open')return void openReplacement(button.dataset.id);
  if(action==='replacement-choose')return showReplacementPicker();
  if(action==='replacement-select'){replacementSelectedId=Number(button.dataset.id);showReplacementPicker();return;}
  if(action==='replacement-back')return void openReplacement(replacementData?.orderId);
  if(action==='replacement-restart'){close();state.tab='feed';render();scrollTo(0,0);return;}
  if(action==='replacement-apply')return void withServer(async()=>{
    if(!replacementData||!replacementSelectedId)return;
    button.disabled=true;
    await api('replacement-apply',{orderId:Number(replacementData.orderId),productId:replacementSelectedId});
    replacementData=null;replacementSelectedId=null;close();state.tab='orders';await refreshServerData();toast('대체 메뉴로 새 예약을 요청했어요.');
  });
  if(action==='product-detail')return productDetail(button.dataset.id);
  if(action==='set-list')return showAiResult();
  if(action==='set-detail')return showSetDetail(button.dataset.id);
  if(!demoSession.signedIn)return signIn();
  if(action==='reserve-product')return void requestReservation([Number(button.dataset.id)],null,false);
  if(action==='reserve-set'){
    const set=setById(button.dataset.id);
    if(set)return void requestReservation(set.products.map(p=>p.id),set.id,!!set.useVoucher,set.voucherCode||null);
    return;
  }
  if(action==='reservation-response')return void withServer(async()=>{
    await api('owner-status',{orderId:Number(button.dataset.id),shopId:ownerShopId,status:button.dataset.value});
    await refreshServerData();toast('주문 상태를 변경했어요.');
  });
  if(action==='product-status')return void withServer(async()=>{
    await api('product-status',{productId:Number(button.dataset.id),shopId:ownerShopId,status:button.dataset.value});
    await refreshServerData();toast(button.dataset.value==='sold_out'?'품절로 표시했어요.':'판매를 재개했어요.');
  });
},true);

function updateReservationTimers(){
  document.querySelectorAll('.reservation-timer').forEach(timer=>{
    const remaining=Math.max(0,Number(timer.dataset.deadline)-Date.now());
    const seconds=Math.min(300,Math.ceil(remaining/1000));
    timer.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    timer.closest('.owner-order-card')?.querySelectorAll('[data-action="reservation-response"]').forEach(button=>{if(remaining===0)button.disabled=true;});
  });
}
setInterval(updateReservationTimers,1000);
setInterval(()=>{if(document.visibilityState==='visible'&&demoSession.signedIn&&['orders','ownerOrders'].includes(state.tab))refreshServerData().catch(()=>{});},15000);
