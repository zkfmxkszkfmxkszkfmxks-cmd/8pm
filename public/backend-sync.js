// Server data owns products, orders, likes and owner actions. Local state keeps only display preferences and the cart.
let backendSession={signedIn:false,owner:false};
let demoSession={signedIn:false,role:null};
const signIn=()=>showLogin();
const originalRender=render;
render=function(){
  originalRender();
  const actions=document.querySelector('.header-actions'), switchButton=actions?.querySelector('.mode-switch');
  if(switchButton){switchButton.textContent=backendSession.owner?'점주 계정':'고객 계정';switchButton.disabled=true;}
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
const api=async(action,payload={})=>{
  const response=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'request_failed');
  return result;
};
const apiGet=async view=>{
  const response=await fetch('/api/data?view='+encodeURIComponent(view),{cache:'no-store'});
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
  if(demoSession.signedIn){
    const [likes,orders]=await Promise.all([apiGet('likes'),apiGet('orders')]);
    state.likes=likes.ids;state.orders=orders.orders;
    state.ownerOrders=backendSession.owner?(await apiGet('owner-orders')).orders:[];
  }else{state.likes=[];state.orders=[];state.ownerOrders=[];}
  state.mode=demoSession.role==='owner'?'owner':'guest';
  if(state.mode==='guest'&&['register','ownerOrders','manage'].includes(state.tab))state.tab='feed';
  if(state.mode==='owner'&&!['register','ownerOrders','manage'].includes(state.tab))state.tab='register';
  render();
  if(demoSession.signedIn)hideLogin();else showLogin();
}
const withServer=async work=>{try{await work()}catch(error){if(error.message==='sign_in_required')signIn();else toast(error.message==='stock_changed'?'재고가 변경됐어요. 다시 확인해 주세요.':'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');}};
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action, productId=Number(button.dataset.id), orderId=productId;
  if(!['mode','demo-logout','like','order','owner-status','confirm-delete-order'].includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action==='mode')return;
  if(action==='demo-logout')return void withServer(async()=>{
    await fetch('/api/demo-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
    state.likes=[];state.orders=[];state.ownerOrders=[];state.cart=[];state.cartSet=null;state.mode='guest';state.tab='feed';close();
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
    await api('owner-status',{orderId,status:button.dataset.value});
    await refreshServerData();toast('주문 상태를 변경했어요.');
  });
  if(action==='confirm-delete-order')return void withServer(async()=>{
    await api('hide-order',{orderId,side:button.dataset.value==='owner'?'owner':'customer'});
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
      await api('product-create',{...payload,image:data.url,surplusReason:draft?.surplusReason||''});
      draft=null;photo=null;state.tab='manage';
    }else await api('product-update',{...payload,productId:Number(form.dataset.id)});
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
      state.tab=fields.get('role')==='owner'?'register':'feed';
      await refreshServerData();scrollTo(0,0);
    }catch{error.textContent='로그인에 실패했습니다. 다시 시도해 주세요.';}
    finally{button.disabled=false;button.textContent='로그인';}
  })();
});
showLogin();
refreshServerData().catch(()=>toast('서버 데이터를 불러오지 못했어요. 새로고침해 주세요.'));
