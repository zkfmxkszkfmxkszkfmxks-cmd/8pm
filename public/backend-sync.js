// Server data owns products, orders, likes and owner actions. Local state keeps only display preferences and the cart.
let backendSession={signedIn:false,owner:false};
const signIn=()=>{window.location.href='/signin-with-chatgpt?return_to=%2Fapp'};
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
  backendSession=await apiGet('session');
  if(backendSession.signedIn){
    const [likes,orders]=await Promise.all([apiGet('likes'),apiGet('orders')]);
    state.likes=likes.ids;state.orders=orders.orders;
    state.ownerOrders=backendSession.owner?(await apiGet('owner-orders')).orders:[];
  }else{state.likes=[];state.orders=[];state.ownerOrders=[];}
  if(!backendSession.owner&&state.mode==='owner'){state.mode='guest';state.tab='feed';}
  render();
}
const withServer=async work=>{try{await work()}catch(error){if(error.message==='sign_in_required')signIn();else toast(error.message==='stock_changed'?'재고가 변경됐어요. 다시 확인해 주세요.':'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');}};
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action, productId=Number(button.dataset.id), orderId=productId;
  if(!['mode','like','order','owner-status','confirm-delete-order'].includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action==='mode'){
    if(state.mode==='guest'&&!backendSession.signedIn)return signIn();
    if(state.mode==='guest'&&!backendSession.owner)return toast('점주 계정만 사장님 화면을 사용할 수 있어요.');
    state.mode=state.mode==='guest'?'owner':'guest';state.tab=state.mode==='owner'?'register':'feed';close();render();scrollTo(0,0);return;
  }
  if(!backendSession.signedIn)return signIn();
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
  if(!backendSession.signedIn)return signIn();
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
refreshServerData().catch(()=>toast('서버 데이터를 불러오지 못했어요. 새로고침해 주세요.'));
