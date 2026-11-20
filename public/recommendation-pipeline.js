// 추천 흐름: 요청 해석 → 현재 재고와 사용자 거리 확인 → 메뉴 순위 계산 → 가게 간 1km와 예산 안에서 조합 생성.
// 추후 AI가 해석 결과를 제공해도 위치·재고·예산 검증은 이 파이프라인에서 수행한다.
(function (root) {
  const MAX_DISTANCE_KM = 3;
  const NEARBY_DISTANCE_KM = 1;
  const MAX_SHOP_GAP_KM = 1;
  const FOOD_PATTERN = /밥|식사|든든|점심|저녁|한식|양식|중식|일식|정식|찌개|파스타|면|돈카츠|덮밥|우동/;
  const SWEET_PATTERN = /디저트|빵|달콤|스콘|크루아상/;
  const DRINK_PATTERN = /커피|라테|아메리카노|카페인/;

  function parseBudget(text) {
    const combined = text.match(/(\d[\d,]*)\s*만\s*(?:(\d[\d,]*)\s*천)?\s*원/);
    if (combined) return Number(combined[1].replaceAll(',', '')) * 10000 + Number((combined[2] || '0').replaceAll(',', '')) * 1000;
    const simple = text.match(/(\d[\d,]*)\s*(천)?\s*원/);
    return simple ? Number(simple[1].replaceAll(',', '')) * (simple[2] ? 1000 : 1) : null;
  }

  function parseIntent(text) {
    const people = Number(text.match(/(\d+)\s*명/)?.[1] || 1);
    const budget = parseBudget(text) || 20000;
    const excludeCoffee = /커피(?:는|를|가)?\s*(빼|제외|없이)|카페인(?:은|을)?\s*(빼|제외|없이)/.test(text);
    return {
      people: Math.max(1, Math.min(10, people)),
      budget: Math.max(1000, Math.min(1000000, budget)),
      coffee: !excludeCoffee,
      meal: FOOD_PATTERN.test(text) || !/커피|음료|카페|디저트|간식|빵/.test(text),
      sweet: SWEET_PATTERN.test(text),
      keywords: text
    };
  }

  function safeIntent(text, proposed) {
    const fallback = parseIntent(text);
    if (!proposed || typeof proposed !== 'object') return fallback;
    const people = Number(proposed.people);
    const budget = Number(proposed.budget);
    const peopleSpecified = /\d+\s*명/.test(text);
    const budgetSpecified = parseBudget(text) !== null;
    return {
      ...fallback,
      people: !peopleSpecified && Number.isInteger(people) && people >= 1 && people <= 10 ? people : fallback.people,
      budget: !budgetSpecified && Number.isFinite(budget) && budget >= 1000 && budget <= 1000000 ? Math.floor(budget) : fallback.budget,
      coffee: proposed.coffee === false ? false : fallback.coffee,
      meal: typeof proposed.meal === 'boolean' ? proposed.meal : fallback.meal,
      sweet: typeof proposed.sweet === 'boolean' ? proposed.sweet : fallback.sweet
    };
  }

  function prepareInventory(menus, shops, origin, distance) {
    const shopsById = new Map(shops.map(shop => [shop.id, shop]));
    return menus.flatMap(menu => {
      const shop = shopsById.get(menu.shop);
      const km = shop ? distance(origin, shop) : Infinity;
      if (!shop || !Number.isFinite(km) || km > MAX_DISTANCE_KM || !Number.isFinite(menu.price) || menu.price <= 0 || !Number.isInteger(menu.stock) || menu.stock <= 0) return [];
      return [{ menu, shop, km }];
    });
  }

  function rankCandidate(candidate, intent) {
    const { menu, shop, km } = candidate;
    return (km <= NEARBY_DISTANCE_KM ? 12 : 0)
      + (intent.meal && shop.category ? 6 : 0)
      + (intent.meal && FOOD_PATTERN.test(menu.name) ? 4 : 0)
      + (intent.sweet && SWEET_PATTERN.test(menu.name) ? 5 : 0)
      + Math.min(3, 8 / (menu.stock + 1)) - km;
  }

  function assembleSet(candidates, intent, distance) {
    let remaining = intent.budget;
    const picked = new Map();
    const selectedShops = new Map();
    const target = Math.min(intent.people * 2, 6);
    for (let round = 0; round < 3 && [...picked.values()].reduce((n, qty) => n + qty, 0) < target; round++) {
      for (const { menu, shop } of candidates) {
        const qty = picked.get(menu.id) || 0;
        if (menu.price > remaining || qty >= Math.min(menu.stock, intent.people)) continue;
        if (!selectedShops.has(shop.id) && [...selectedShops.values()].some(other => distance(other, shop) > MAX_SHOP_GAP_KM)) continue;
        picked.set(menu.id, qty + 1);
        selectedShops.set(shop.id, shop);
        remaining -= menu.price;
        if ([...picked.values()].reduce((n, count) => n + count, 0) >= target) break;
      }
    }
    return { items: [...picked].map(([id, qty]) => ({ id, qty })), total: intent.budget - remaining };
  }

  function run({ text, menus, shops, origin, distance, setDiscount, intent: modelIntent }) {
    const intent = safeIntent(text, modelIntent);
    const inventory = prepareInventory(menus, shops, origin, distance);
    const candidates = inventory.filter(({ menu }) => intent.coffee || !DRINK_PATTERN.test(menu.name));
    candidates.sort((a, b) => Number(b.km <= NEARBY_DISTANCE_KM) - Number(a.km <= NEARBY_DISTANCE_KM) || rankCandidate(b, intent) - rankCandidate(a, intent) || a.km - b.km || a.menu.price - b.menu.price || a.menu.id - b.menu.id);
    const set = assembleSet(candidates, intent, distance);
    const discount = set.items.length ? setDiscount(set.total) : 0;
    return {
      ...intent, ...set, discount,
      stats: { inRange: inventory.length, eligible: candidates.length, withinOneKm: candidates.filter(x => x.km <= NEARBY_DISTANCE_KM).length },
      strategy: modelIntent ? 'model-intent-with-verified-inventory' : 'rules-demo'
    };
  }

  const pipeline = { parseIntent, safeIntent, prepareInventory, rankCandidate, assembleSet, run };
  root.MAGAM_PIPELINE = pipeline;
  if (typeof module !== 'undefined' && module.exports) module.exports = pipeline;
})(typeof window === 'undefined' ? globalThis : window);
