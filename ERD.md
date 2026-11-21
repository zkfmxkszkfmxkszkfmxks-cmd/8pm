# 데이터 구조

```mermaid
erDiagram
    USERS ||--o{ ORDERS : requests
    USERS ||--o{ RECOMMENDATIONS : receives
    SHOPS ||--o{ PRODUCTS : lists
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : requested_as
    ORDERS ||--|{ ORDER_PICKUPS : requires
    SHOPS ||--o{ ORDER_PICKUPS : responds_to
    RECOMMENDATIONS o|--o{ ORDERS : used_for
    ORDERS o|--o| ORDERS : replaced_by

    PRODUCTS {
      text id PK
      text shop_id FK
      text name
      text description
      integer original_price
      integer min_price
      integer price
      integer closing_at
      text status "active | sold_out | hidden"
    }
    RECOMMENDATIONS {
      text id PK
      text customer_user_id FK
      text product_ids "JSON of registered IDs"
      text items_json "product ID and quantity"
      text voucher_code
      text reason
      integer expires_at
    }
    ORDERS {
      text id PK
      text customer_user_id FK
      integer requested_at
      integer response_deadline_at
      integer confirmed_at
      text status "waiting | confirmed | sold_out | timeout | completed | no_show"
      text recommendation_id FK
      text replacement_of_order_id "original sold-out order, unique"
      integer total
      text payment_method "onsite"
    }
    ORDER_ITEMS {
      integer id PK
      text order_id FK
      text product_id FK
      text shop_id FK
      integer quantity "fixed at 1 for new requests"
      integer unit_price "snapshot at request time"
    }
    ORDER_PICKUPS {
      text order_id FK
      text shop_id FK
      text status "waiting | accepted | completed | sold_out | timeout | no_show | cancelled"
      text response_status "waiting | accepted | sold_out | timeout | cancelled"
      text receipt_status "pending | completed | no_show"
      integer responded_at
      integer received_at
      integer pickup_deadline_at
    }
```

상품에 등록 수량 필드는 없습니다. `ORDER_ITEMS.quantity`는 기존 주문 기록과 호환을 위해 남겨 두며 신규 예약 요청은 항상 1로 저장합니다. 예약 전체 상태는 가게별 `ORDER_PICKUPS.status`에서 계산합니다. `waiting`이 모두 `accepted`가 되면 확정하고, `sold_out` 또는 `timeout`이 발생하면 종료합니다. 픽업 마감 후 미수령은 `no_show`입니다.

품절 주문에서 대체 메뉴를 선택하면 원래 주문은 기록으로 남고 새 예약을 만듭니다. `replacement_of_order_id`로 원래 주문을 연결하며 한 주문에는 대체 예약을 한 번만 만들 수 있습니다. 새 주문의 메뉴 가격과 픽업 기한을 다시 계산하고 해당 가게에 새 응답을 요청합니다.
