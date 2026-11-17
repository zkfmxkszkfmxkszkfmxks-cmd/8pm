// Fictional shops placed at approximate neighborhood coordinates for the Seoul demo.
window.SEOUL_SHOPS=[
  {id:'bake',name:'오후의 빵집',area:'성수동',image:'croissant',lat:37.5445,lng:127.0433,address:'서울 성동구 성수동 · 예시 위치'},
  {id:'cafe',name:'모퉁이 커피',area:'성수동',image:'coffee',lat:37.5438,lng:127.0421,address:'서울 성동구 성수동 · 예시 위치'},
  {id:'rice',name:'소담한 식탁',area:'성수동',image:'rice',lat:37.5441,lng:127.0407,address:'서울 성동구 성수동 · 예시 위치'},
  {id:'yeonnam',name:'연남 작은 식탁',area:'연남동',image:'sandwich',lat:37.5651,lng:126.9245,address:'서울 마포구 연남동 · 예시 위치'},
  {id:'mangwon',name:'망원 한입상점',area:'망원동',image:'orange',lat:37.5562,lng:126.9027,address:'서울 마포구 망원동 · 예시 위치'},
  {id:'euljiro',name:'을지로 점심방',area:'을지로',image:'rice',lat:37.5663,lng:126.9916,address:'서울 중구 을지로 · 예시 위치'},
  {id:'ikseon',name:'익선 오후다방',area:'익선동',image:'latte',lat:37.5740,lng:126.9894,address:'서울 종로구 익선동 · 예시 위치'},
  {id:'gwanghwa',name:'광화문 도시락',area:'광화문',image:'onigiri',lat:37.5719,lng:126.9782,address:'서울 종로구 광화문 · 예시 위치'},
  {id:'itaewon',name:'이태원 브런치집',area:'이태원',image:'egg',lat:37.5343,lng:126.9936,address:'서울 용산구 이태원동 · 예시 위치'},
  {id:'hannam',name:'한남 디저트룸',area:'한남동',image:'scone',lat:37.5378,lng:127.0110,address:'서울 용산구 한남동 · 예시 위치'},
  {id:'yeouido',name:'여의도 커피동',area:'여의도',image:'coffee',lat:37.5214,lng:126.9247,address:'서울 영등포구 여의도동 · 예시 위치'},
  {id:'gangnam',name:'강남 아침식탁',area:'강남역',image:'sandwich',lat:37.4979,lng:127.0276,address:'서울 강남구 역삼동 · 예시 위치'},
  {id:'sinsa',name:'신사 베이크룸',area:'신사동',image:'croissant',lat:37.5163,lng:127.0200,address:'서울 강남구 신사동 · 예시 위치'},
  {id:'jamsil',name:'잠실 쉼표카페',area:'잠실',image:'latte',lat:37.5132,lng:127.1005,address:'서울 송파구 잠실동 · 예시 위치'},
  {id:'songpa',name:'송파 한입식당',area:'송파동',image:'rice',lat:37.5036,lng:127.1126,address:'서울 송파구 송파동 · 예시 위치'},
  {id:'konkuk',name:'건대 골목카페',area:'건대입구',image:'coffee',lat:37.5407,lng:127.0695,address:'서울 광진구 화양동 · 예시 위치'},
  {id:'nowon',name:'노원 햇살빵',area:'노원',image:'scone',lat:37.6544,lng:127.0612,address:'서울 노원구 상계동 · 예시 위치'},
  {id:'mia',name:'미아 작은 주방',area:'미아동',image:'onigiri',lat:37.6133,lng:127.0302,address:'서울 강북구 미아동 · 예시 위치'},
  {id:'guro',name:'구로 출근길',area:'구로디지털단지',image:'sandwich',lat:37.4956,lng:126.8875,address:'서울 구로구 구로동 · 예시 위치'},
  {id:'mokdong',name:'목동 주말브런치',area:'목동',image:'egg',lat:37.5261,lng:126.8750,address:'서울 양천구 목동 · 예시 위치'}
];
const firstNine=[
  [1,'bake','딸기 크루아상',4500,10,'croissant','바삭한 크루아상에 달콤한 오후 한 조각'],
  [2,'cafe','아메리카노',3000,30,'coffee','고소하고 부드러운 오늘의 원두'],
  [3,'rice','소담 채소 덮밥',8500,15,'rice','채소 듬뿍, 든든한 한 끼'],
  [4,'bake','버터 스콘',3500,12,'scone','겉은 바삭, 속은 촉촉'],
  [5,'cafe','오렌지 주스',4000,20,'orange','커피 대신 상큼한 한 잔'],
  [6,'rice','꼬마 주먹밥',2000,24,'onigiri','산책길에 쏙, 아이와 함께'],
  [7,'bake','오늘의 샌드위치',6500,8,'sandwich','싱싱한 채소를 넉넉하게'],
  [8,'cafe','카페라테',4500,25,'latte','고소한 우유와 에스프레소'],
  [9,'rice','에그 샐러드',5500,10,'egg','가벼운 한 끼도 정성 가득']
];
const moreMenus=[
  ['yeonnam',[['연남 치킨 샌드위치',7200,16,'sandwich'],['허브 에그 샐러드',6200,12,'egg'],['오렌지 한 잔',4200,20,'orange']]],
  ['mangwon',[['망원 과일 주스',4300,18,'orange'],['소풍 주먹밥',2800,22,'onigiri'],['한입 에그 샐러드',5800,14,'egg']]],
  ['euljiro',[['을지로 채소 덮밥',8900,11,'rice'],['점심 주먹밥',3000,18,'onigiri'],['달걀 한 접시',5900,10,'egg']]],
  ['ikseon',[['익선 카페라테',4900,21,'latte'],['따뜻한 버터 스콘',3800,13,'scone'],['아침 크루아상',4600,12,'croissant']]],
  ['gwanghwa',[['광화문 주먹밥 세트',5200,17,'onigiri'],['든든 채소 덮밥',9200,12,'rice'],['출근길 샌드위치',6900,15,'sandwich']]],
  ['itaewon',[['이태원 에그 플레이트',7500,12,'egg'],['채소 샌드위치',7100,14,'sandwich'],['생오렌지 주스',4800,18,'orange']]],
  ['hannam',[['한남 버터 스콘',4200,15,'scone'],['아몬드 크루아상',5400,10,'croissant'],['바닐라 라테',5300,20,'latte']]],
  ['yeouido',[['여의도 아메리카노',3500,28,'coffee'],['출근길 카페라테',4800,24,'latte'],['오렌지 주스',4300,18,'orange']]],
  ['gangnam',[['아침 샌드위치',7400,17,'sandwich'],['채소 듬뿍 덮밥',9500,13,'rice'],['에그 샐러드 볼',6500,12,'egg']]],
  ['sinsa',[['신사 크루아상',5200,14,'croissant'],['메이플 스콘',4300,16,'scone'],['그린 샌드위치',7500,11,'sandwich']]],
  ['jamsil',[['잠실 아메리카노',3400,27,'coffee'],['꿀 라테',5100,20,'latte'],['상큼 오렌지 주스',4400,16,'orange']]],
  ['songpa',[['송파 채소 덮밥',8800,14,'rice'],['참깨 주먹밥',2700,23,'onigiri'],['달걀 샐러드',5900,12,'egg']]],
  ['konkuk',[['건대 아메리카노',3200,30,'coffee'],['오렌지 에이드',4500,19,'orange'],['초코 버터 스콘',4000,17,'scone']]],
  ['nowon',[['햇살 버터 스콘',3900,15,'scone'],['노원 크루아상',4700,13,'croissant'],['오늘의 샌드위치',6800,12,'sandwich']]],
  ['mia',[['미아 채소 덮밥',8200,14,'rice'],['꼬마 주먹밥',2500,21,'onigiri'],['에그 샐러드',5600,13,'egg']]],
  ['guro',[['출근길 샌드위치',6600,20,'sandwich'],['모닝 아메리카노',3000,29,'coffee'],['생오렌지 한 잔',4100,18,'orange']]],
  ['mokdong',[['목동 에그 브런치',7200,11,'egg'],['주말 샌드위치',7300,13,'sandwich'],['따뜻한 카페라테',4900,22,'latte']]]
];
window.SEOUL_MENU_DEFS=[
  ...firstNine,
  ...moreMenus.flatMap(([shop,items],group)=>items.map(([name,price,stock,image],index)=>[10+group*3+index,shop,name,price,stock,image,'오늘 준비한 '+name]))
];
