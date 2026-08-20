-- 兑换码系统：兑换码表、店铺商品表、店铺订单表

-- 兑换码表：每个码对应一个积分套餐，可由管理员批量生成或店铺订单支付后自动生成
CREATE TABLE IF NOT EXISTS redemption_codes (
  code_id BIGSERIAL PRIMARY KEY,
  code text NOT NULL UNIQUE,
  package_id text NOT NULL,
  package_name text NOT NULL,
  base_credits integer NOT NULL,
  bonus_credits integer NOT NULL,
  total_credits integer NOT NULL,
  status text NOT NULL DEFAULT 'unused',   -- unused / redeemed / disabled
  source text NOT NULL DEFAULT 'admin',    -- admin / shop_order
  batch_id text,
  shop_order_no text,
  created_by text,                          -- admin 标识
  redeemed_by text,                         -- 兑换者 account_id
  redeemed_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS redemption_codes_code_idx ON redemption_codes(code);
CREATE INDEX IF NOT EXISTS redemption_codes_status_idx ON redemption_codes(status);
CREATE INDEX IF NOT EXISTS redemption_codes_batch_idx ON redemption_codes(batch_id);
CREATE INDEX IF NOT EXISTS redemption_codes_shop_order_idx ON redemption_codes(shop_order_no);
CREATE INDEX IF NOT EXISTS redemption_codes_redeemed_by_idx ON redemption_codes(redeemed_by);
CREATE INDEX IF NOT EXISTS redemption_codes_created_at_idx ON redemption_codes(created_at DESC);

-- 店铺商品表：每个商品关联一个积分套餐，用户购买后获得兑换码
CREATE TABLE IF NOT EXISTS shop_products (
  product_id BIGSERIAL PRIMARY KEY,
  name text NOT NULL,
  description text,
  package_id text NOT NULL,
  price text NOT NULL,
  status text NOT NULL DEFAULT 'active',   -- active / inactive
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_products_status_idx ON shop_products(status);
CREATE INDEX IF NOT EXISTS shop_products_sort_idx ON shop_products(sort_order);

-- 店铺订单表：用户在店铺下单的记录，支付成功后分配兑换码
CREATE TABLE IF NOT EXISTS shop_orders (
  order_id BIGSERIAL PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  product_id bigint NOT NULL,
  product_name text NOT NULL,
  package_id text NOT NULL,
  price text NOT NULL,
  buyer_email text NOT NULL,
  buyer_name text,
  status text NOT NULL DEFAULT 'created',   -- created / waiting / paid / fulfilled / cancelled / failed / expired
  payment_method text,                       -- alipay / wechat
  provider text,                             -- epay
  provider_trade_no text,
  provider_status text,
  qr_code text,
  pay_url text,
  qr_data_url text,
  redemption_code text,                       -- 支付成功后分配的兑换码
  expires_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_orders_order_no_idx ON shop_orders(order_no);
CREATE INDEX IF NOT EXISTS shop_orders_status_idx ON shop_orders(status);
CREATE INDEX IF NOT EXISTS shop_orders_email_idx ON shop_orders(buyer_email);
CREATE INDEX IF NOT EXISTS shop_orders_created_at_idx ON shop_orders(created_at DESC);

-- 在 orders 表中新增 shop_credits 订单类型（复用 orders 表记录支付状态，不直接加积分）
-- orders.order_type 枚举值：license / credits / shop_credits
-- shop_credits 类型的订单在结算时不加积分，而是生成兑换码并关联到 shop_orders
