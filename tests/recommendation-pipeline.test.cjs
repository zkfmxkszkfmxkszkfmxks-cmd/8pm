const test = require('node:test');
const assert = require('node:assert/strict');
const pipeline = require('../dist/recommendation-pipeline.js');

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
const context = { shops, menus, origin: {}, distance: (_, shop) => shop.km, setDiscount: total => Math.round(total * 0.1) };

test('인원·예산·커피 제외 조건을 해석한다', () => {
  const intent = pipeline.parseIntent('2명이 2만원으로 식사하고 커피는 빼줘');
  assert.equal(intent.people, 2);
  assert.equal(intent.budget, 20000);
  assert.equal(intent.coffee, false);
});

test('3km 밖·품절·제외 메뉴를 걸러 내고 예산과 재고를 지킨다', () => {
  const result = pipeline.run({ ...context, text: '2명이 2만원으로 식사하고 커피는 빼줘' });
  assert.equal(result.strategy, 'rules-demo');
  assert.equal(result.stats.inRange, 3);
  assert.deepEqual(result.items.map(item => item.id), [1, 3]);
  assert(result.total <= result.budget);
  assert.equal(result.discount, Math.round(result.total * 0.1));
  for (const item of result.items) assert(item.qty <= menus.find(menu => menu.id === item.id).stock);
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
