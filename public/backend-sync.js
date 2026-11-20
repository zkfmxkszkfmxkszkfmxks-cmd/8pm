// Server data owns products, orders, likes and owner actions. Local state keeps only display preferences and the cart.
let backendSession={signedIn:false,owner:false};
let demoSession={signedIn:false,role:null};
let ownerShopId=sessionStorage.getItem('owner-shop-id')||null;
const signIn=()=>showLogin();
const originalShopCard=shopCard;
shopCard=function(group){
  const own=state.mode==='owner'&&group.shop.id===OWNER_SHOP_ID;
  const voucher=group.shop.acceptsVoucher;
  const label=own?'<div class="owner-feed-label">내 가게</div>':'';
  const voucherLabel=`<div class="voucher-feed-label ${voucher?'available':'unavailable'}">${voucher?'상품권 사용 가능':'상품권 사용 불가'}</div>`;
  return originalShopCard(group).replace('<div class="post-top">',label+voucherLabel+'<div class="post-top">');
};
const originalManagePage=managePage;
managePage=function(){
  const selected=shop(OWNER_SHOP_ID),accepts=!!selected.acceptsVoucher;
  return originalManagePage()+`<section class="panel voucher-settings"><div class="panel-title"><h2>가게 설정</h2></div><div class="voucher-settings-row"><div><strong>상품권 사용</strong><p>손님 피드에 사용 가능 여부가 표시됩니다.</p></div><button type="button" data-action="voucher-toggle" role="switch" aria-checked="${accepts}" aria-label="상품권 사용 ${accepts?'가능':'불가'}" class="voucher-switch ${accepts?'on':''}"><span></span></button></div><small class="voucher-settings-state">현재 ${accepts?'사용 가능':'사용 불가'}</small></section>`;
};
const originalRender=render;
render=function(){
  originalRender();
  const actions=document.querySelector('.header-actions'), switchButton=actions?.querySelector('.mode-switch');
  if(switchButton){switchButton.textContent=backendSession.owner?'점주 계정':'고객 계정';switchButton.disabled=true;}
  if(backendSession.owner&&ownerShopId&&actions&&!actions.querySelector('.shop-change-button'))actions.insertAdjacentHTML('beforeend','<button class="shop-change-button" data-action="owner-change-shop" type="button">가게 변경</button>');
  if(actions&&!actions.querySelector('.logout-button'))actions.insertAdjacentHTML('beforeend','<button class="logout-button" data-action="demo-logout" type="button">로그아웃</button>');
};
function showLogin(){
  let gate=document.querySelector('#login-gate');
  if(!gate){
    gate=document.createElement('div');gate.id='login-gate';
    gate.innerHTML='<main class="login-card"><div class="login-logo"><span>ㅎ</span> 마감한끼</div><h1>골목의 한 끼를 만나보세요</h1><p>이용할 계정을 선택하고 로그인해 주세요.</p><form id="demo-login-form"><fieldset><legend>이용 방식 선택</legend><label class="login-role"><input type="radio" name="role" value="customer" required><span><strong>고객</strong><small>오늘의 메뉴를 찾고 주문하기</small></span></label><label class="login-role"><input type="radio" name="role" value="owner" required><span><strong>점주</strong><small>메뉴를 등록하고 주문 관리하기</small></span></label></fieldset><label class="login-field">아이디<input name="username" type="text" inputmode="numeric" autocomplete="username" required placeholder="아이디 입력"></label><label class="login-field">비밀번호<input name="password" type="password" inputmode="numeric" autocomplete="current-password" required placeholder="비밀번호 입력"></label><p id="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="submit">로그인</button></form><p class="login-hint">시연용 계정 · 아이디 1 / 비밀번호 1<br>고객과 점주 중 하나를 선택해 주세요.</p></main>';
    document.body.append(gate);
  }
  gate.hidden=false;document.body.classList.add('login-open');
}
function hideLogin(){const gate=document.querySelector('#login-gate');if(gate)gate.hidden=true;document.body.classList.remove('login-open');}
function showShopPicker(){
  let gate=document.querySelector('#shop-picker');
  if(!gate){
    gate=document.createElement('div');gate.id='shop-picker';
    gate.innerHTML='<main class="shop-picker-card"><div class="login-logo"><span>ㅎ</span> 마감한끼</div><h1>내 가게를 선택해 주세요</h1><p>가게를 선택하면 해당 가게의 피드·주문·메뉴 관리를 볼 수 있어요.</p><label class="shop-picker-search">가게 검색<input id="owner-shop-search" type="search" placeholder="가게 이름 또는 지역 검색"></label><div id="owner-shop-list" class="owner-shop-list"></div><p class="shop-picker-note">시연용 가상 가게 목록입니다.</p><button class="shop-picker-logout" data-action="demo-logout" type="button">다른 계정으로 로그인</button></main>';
    document.body.append(gate);
  }
  gate.hidden=false;document.body.classList.add('shop-picker-open');renderShopPickerList();
}
function hideShopPicker(){const gate=document.querySelector('#shop-picker');if(gate)gate.hidden=true;document.body.classList.remove('shop-picker-open');}
function renderShopPickerList(){
  const list=document.querySelector('#owner-shop-list');if(!list)return;
  const query=(document.querySelector('#owner-shop-search')?.value||'').trim().toLocaleLowerCase();
  const filtered=shops.filter(s=>(s.name+' '+s.area+' '+(s.category||'')).toLocaleLowerCase().includes(query));
  list.innerHTML=filtered.map(s=>`<button class="owner-shop-choice" type="button" data-action="owner-select-shop" data-value="${esc(s.id)}"><img src="assets/${esc(s.image)}.jpg" alt=""><span><strong>${esc(s.name)}</strong><small>${esc(s.area)} · ${esc(s.category||'골목 가게')}</small></span><b>선택</b></button>`).join('')||'<p class="muted">검색 결과가 없어요.</p>';
}
const api=async(action,payload={})=>{
  const response=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'request_failed');
  return result;
};
const apiGet=async(view,shopId)=>{
  const response=await fetch('/api/data?view='+encodeURIComponent(view)+(shopId?'&shopId='+encodeURIComponent(shopId):''),{cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'request_failed');
  return result;
};
async function refreshServerData(){
  const catalog=await apiGet('catalog');
  shops.splice(0,shops.length,...catalog.shops);
  state.menus=catalog.menus;
  state.cart=state.cart.filter(x=>state.menus.some(m=>m.id===x.id));
  demoSession=await (await fetch('/api/demo-auth',{cache:'no-store'})).json();
  backendSession=demoSession.signedIn?await apiGet('session'):{signedIn:false,owner:false};
  if(!shops.some(s=>s.id===ownerShopId))ownerShopId=null;
  if(demoSession.role==='owner'&&ownerShopId)OWNER_SHOP_ID=ownerShopId;
  if(demoSession.signedIn){
    const [likes,orders]=await Promise.all([apiGet('likes'),apiGet('orders')]);
    state.likes=likes.ids;state.orders=orders.orders;
    state.ownerOrders=backendSession.owner&&ownerShopId?(await apiGet('owner-orders',ownerShopId)).orders:[];
  }else{state.likes=[];state.orders=[];state.ownerOrders=[];}
  state.mode=demoSession.role==='owner'?'owner':'guest';
  if(state.mode==='guest'&&['register','ownerOrders','manage'].includes(state.tab))state.tab='feed';
  if(state.mode==='owner'&&!['feed','register','ownerOrders','manage'].includes(state.tab))state.tab='feed';
  render();
  if(demoSession.signedIn)hideLogin();else showLogin();
  if(demoSession.role==='owner'&&!ownerShopId)showShopPicker();else hideShopPicker();
}
const withServer=async work=>{try{await work()}catch(error){if(error.message==='sign_in_required')signIn();else toast(error.message==='stock_changed'?'재고가 변경됐어요. 다시 확인해 주세요.':'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');}};
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action, productId=Number(button.dataset.id), orderId=productId;
  if(!['mode','demo-logout','owner-select-shop','owner-change-shop','voucher-toggle','like','order','owner-status','confirm-delete-order'].includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action==='mode')return;
  if(action==='owner-select-shop')return void withServer(async()=>{
    const choice=shops.find(s=>s.id===button.dataset.value);if(!choice)return;
    ownerShopId=choice.id;OWNER_SHOP_ID=choice.id;sessionStorage.setItem('owner-shop-id',choice.id);storyFilter='';feedQuery='';state.tab='feed';
    await refreshServerData();scrollTo(0,0);
  });
  if(action==='owner-change-shop'){ownerShopId=null;sessionStorage.removeItem('owner-shop-id');showShopPicker();return;}
  if(action==='voucher-toggle')return void withServer(async()=>{
    if(!backendSession.owner||!ownerShopId)return;
    button.disabled=true;
    await api('shop-voucher',{shopId:ownerShopId,acceptsVoucher:!shop(ownerShopId).acceptsVoucher});
    await refreshServerData();toast('상품권 사용 설정을 저장했어요.');
  });
  if(action==='demo-logout')return void withServer(async()=>{
    await fetch('/api/demo-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
    ownerShopId=null;sessionStorage.removeItem('owner-shop-id');state.likes=[];state.orders=[];state.ownerOrders=[];state.cart=[];state.cartSet=null;state.mode='guest';state.tab='feed';close();
    await refreshServerData();
  });
  if(!demoSession.signedIn)return signIn();
  if(action==='like')return void withServer(async()=>{await api('like',{productId});await refreshServerData()});
  if(action==='order')return void withServer(async()=>{
    if(!state.cart.length)return;
    const result=await api('order',{items:state.cart,setItems:state.cartSet||[],origin:center()});
    state.cart=[];state.cartSet=null;close();state.mode='guest';state.tab='orders';
    await refreshServerData();route(result.orderId);
  });
  if(action==='owner-status')return void withServer(async()=>{
    if(!backendSession.owner)return;
    await api('owner-status',{orderId,status:button.dataset.value,shopId:ownerShopId});
    await refreshServerData();toast('주문 상태를 변경했어요.');
  });
  if(action==='confirm-delete-order')return void withServer(async()=>{
    await api('hide-order',{orderId,side:button.dataset.value==='owner'?'owner':'customer',shopId:ownerShopId});
    close();await refreshServerData();toast('내역을 삭제했어요.');
  });
},true);
document.addEventListener('submit',event=>{
  const form=event.target;if(!['draft-form','edit-form'].includes(form.id))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!demoSession.signedIn)return signIn();
  if(!backendSession.owner)return toast('점주 계정만 메뉴를 등록할 수 있어요.');
  void withServer(async()=>{
    const values=new FormData(form);
    const payload={name:String(values.get('name')||'').trim(),originalPrice:Number(values.get('price')),stock:Number(values.get('stock')),closing:String(values.get('closing')||''),description:String(values.get('desc')||'').trim()||'마감 상품을 판매합니다'};
    if(form.id==='draft-form'){
      if(!photo)return toast('상품 사진을 선택해 주세요.');
      const blob=await(await fetch(photo)).blob(), upload=new FormData();upload.append('file',blob,'product.jpg');
      const uploaded=await fetch('/api/uploads',{method:'POST',body:upload});
      const data=await uploaded.json();if(!uploaded.ok)throw Error(data.error||'upload_failed');
      await api('product-create',{...payload,image:data.url,surplusReason:draft?.surplusReason||'',shopId:ownerShopId});
      draft=null;photo=null;state.tab='manage';
    }else await api('product-update',{...payload,productId:Number(form.dataset.id),shopId:ownerShopId});
    close();await refreshServerData();toast('메뉴 정보를 저장했어요.');
  });
},true);
document.addEventListener('submit',event=>{
  if(event.target.id!=='demo-login-form')return;
  event.preventDefault();
  const form=event.target,button=form.querySelector('button[type="submit"]'),error=form.querySelector('#login-error'),fields=new FormData(form);
  error.textContent='';button.disabled=true;button.textContent='확인 중...';
  void (async()=>{
    try{
      const response=await fetch('/api/demo-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',role:fields.get('role'),username:fields.get('username'),password:fields.get('password')})});
      if(!response.ok){error.textContent='계정 유형, 아이디와 비밀번호를 확인해 주세요.';return;}
      ownerShopId=null;sessionStorage.removeItem('owner-shop-id');state.tab='feed';
      await refreshServerData();scrollTo(0,0);
    }catch{error.textContent='로그인에 실패했습니다. 다시 시도해 주세요.';}
    finally{button.disabled=false;button.textContent='로그인';}
  })();
});
document.addEventListener('input',event=>{if(event.target.id==='owner-shop-search')renderShopPickerList()});
showLogin();
refreshServerData().catch(()=>toast('서버 데이터를 불러오지 못했어요. 새로고침해 주세요.'));
