import { readFileSync, writeFileSync } from 'node:fs';

const seedFile = new URL('../db/seed.json', import.meta.url);
const browserFile = new URL('../public/seoul-data.js', import.meta.url);
const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
const address = '서울 성동구 성수동 · 예시 위치';
const relocated = new Map([
  ['yeonnam', ['성수 파스타 작업실', 37.5448, 127.0482]],
  ['mangwon', ['성수 한입상점', 37.5455, 127.0490]],
  ['euljiro', ['성수 집밥상회', 37.5439, 127.0497]],
  ['ikseon', ['성수 오후다방', 37.5461, 127.0502]],
  ['gwanghwa', ['성수 작은 일식당', 37.5447, 127.0510]],
  ['itaewon', ['성수 골목비스트로', 37.5431, 127.0504]],
  ['hannam', ['성수 디저트룸', 37.5452, 127.0521]],
  ['yeouido', ['성수 커피동', 37.5460, 127.0528]],
  ['gangnam', ['성수 아침식탁', 37.5438, 127.0532]],
]);
const oldAreas = ['연남', '망원', '을지로', '익선', '광화문', '이태원', '한남', '여의도', '강남'];
for (const shop of seed.shops) {
  const update = relocated.get(shop.id);
  if (!update) continue;
  [shop.name, shop.lat, shop.lng] = update;
  shop.area = '성수동';
  shop.address = address;
}
for (const menu of seed.menus) {
  menu[4] = Math.min(menu[4], 5);
  if (relocated.has(menu[1])) {
    for (const oldArea of oldAreas) {
      menu[2] = menu[2].replaceAll(oldArea, '성수');
      menu[6] = menu[6].replaceAll(oldArea, '성수');
    }
  }
}
writeFileSync(seedFile, JSON.stringify(seed, null, 2) + '\n', 'utf8');
writeFileSync(browserFile, `// Fictional Seoul shops and sample inventory. The server database is authoritative.\nwindow.SEOUL_SHOPS=${JSON.stringify(seed.shops)};\nwindow.SEOUL_MENU_DEFS=${JSON.stringify(seed.menus)};\n`, 'utf8');
console.log(`Relocated ${relocated.size} shops; capped ${seed.menus.length} sample products at 5.`);
