const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scriptSandbox = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/recommendation-pipeline.js'), 'utf8'), scriptSandbox);
const pipeline = scriptSandbox.MAGAM_PIPELINE;

const shops = [
  { id: 'near', km: 0.4, category: '한식' },
  { id: 'mid', km: 2.1, category: '양식' },
  { id: 'far', km: 4.2, category: '중식' }
];
const menus = [
  { id: 1, shop: 'near', name: '오늘의 덮밥', price: 8000, stock: 2 },
  { id: 2, shop: 'near', name: '병입 커피', price: 3000, stock: 2 },
  { id: 3, shop: 'mid', name: '파스타', price: 9000, stock: 2 },
  { id: 4, shop: 'far', name: '짜장면', price: 6000, stock: 2 },
  { id: 5, shop: 'near', name: '품절 반찬', price: 4000, stock: 0 }
];
const context = { shops, menus, origin: {}, distance: (from, shop) => from?.id ? Math.abs(from.km - shop.km) : shop.km, setDiscount: total => Math.round(total * 0.1) };

test('인원·예산·커피 제외 조건을 해석한다', () => {
  const intent = pipeline.parseIntent('2명이 2만원으로 식사하고 커피는 빼줘');
  assert.equal(intent.people, 2);
  assert.equal(intent.budget, 20000);
  assert.equal(intent.coffee, false);
});

test('3km 밖·품절·제외 메뉴와 1km 밖의 다른 가게를 걸러 낸다', () => {
  const result = pipeline.run({ ...context, text: '2명이 2만원으로 식사하고 커피는 빼줘' });
  assert.equal(result.strategy, 'rules-demo');
  assert.equal(result.stats.inRange, 3);
  assert.deepEqual(Array.from(result.items, item => item.id), [1]);
  assert(result.total <= result.budget);
  assert.equal(result.discount, Math.round(result.total * 0.1));
  for (const item of result.items) assert(item.qty <= menus.find(menu => menu.id === item.id).stock);
});

test('여러 가게를 추천할 때 모든 가게 쌍의 거리가 1km 이하다', () => {
  const groupShops = [
    { id: 'a', km: 0.2, category: '한식' },
    { id: 'b', km: 0.8, category: '한식' },
    { id: 'c', km: 1.5, category: '한식' }
  ];
  const groupMenus = groupShops.map((shop, index) => ({ id: index + 10, shop: shop.id, name: '한 끼 덮밥', price: 5000, stock: 3 }));
  const result = pipeline.run({ ...context, shops: groupShops, menus: groupMenus, text: '3명이 3만원으로 식사' });
  const selected = result.items.map(item => groupShops.find(shop => shop.id === groupMenus.find(menu => menu.id === item.id).shop));
  assert(selected.some(shop => shop.id === 'a'));
  assert(selected.some(shop => shop.id === 'b'));
  assert(!selected.some(shop => shop.id === 'c'));
  for (const left of selected) for (const right of selected) assert(Math.abs(left.km - right.km) <= 1);
});

test('AI 해석 결과도 사용자가 명시한 인원·예산·제외 조건을 덮어쓰지 못한다', () => {
  const result = pipeline.run({
    ...context,
    text: '2명이 2만원으로 식사하고 커피는 빼줘',
    intent: { people: 5, budget: 100000, coffee: true, meal: true }
  });
  assert.equal(result.people, 2);
  assert.equal(result.budget, 20000);
  assert.equal(result.coffee, false);
  assert.equal(result.strategy, 'model-intent-with-verified-inventory');
});
