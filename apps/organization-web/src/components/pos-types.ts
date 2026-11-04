export interface SimulatorVariantItem {
  productId: string;
  productCode: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  barcode: string;
  price: number;
  onHand: number;
}

export interface SimulatorCartItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
}

export interface SimulatorOutboxOrder {
  event_id: string;
  idempotency_key: string;
  client_order_id: string;
  store_id: string;
  occurred_at: string;
  total_amount: number;
  items: {
    product_variant_id: string;
    productName: string;
    quantity: string;
    unit_price: string;
  }[];
}

export interface SimulatorOrderRecord {
  id: string;
  order_number: string;
  store_id: string;
  status: string;
  payment_status: string;
  total_amount: string;
  paid_amount: string;
  change_amount: string;
  occurred_at: string;
}

export type PosMenuTab =
  | "home"
  | "pos"
  | "orders"
  | "customers"
  | "stock"
  | "stats"
  | "notifications"
  | "settings";

export type CategoryId =
  | "all"
  | "coffee"
  | "tea"
  | "pastry"
  | "matcha"
  | "signature"
  | "combo";
