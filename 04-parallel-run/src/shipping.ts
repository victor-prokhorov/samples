export type Item = { sku: string; grams: number; priceCents: number };

export type Order = { zone: "domestic" | "eu" | "world"; items: Item[] };

const RATE_PER_KG = { domestic: 400, eu: 900, world: 1600 };

const FREE_SHIPPING_CENTS = 5000;

export function legacyShipping(order: Order): number {
  let subtotal = 0;
  let grams = 0;
  for (let i = 0; i < order.items.length; i++) {
    subtotal = subtotal + order.items[i].priceCents;
    grams = grams + order.items[i].grams;
  }
  if (order.zone === "domestic" && subtotal >= FREE_SHIPPING_CENTS) return 0;
  let kg = Math.ceil(grams / 1000);
  if (kg < 1) kg = 1;
  return kg * RATE_PER_KG[order.zone];
}

export function rewrittenShippingV1(order: Order): number {
  if (order.items.length === 0) throw new Error("order has no items");
  const subtotal = order.items.reduce((sum, i) => sum + i.priceCents, 0);
  if (order.zone === "domestic" && subtotal > FREE_SHIPPING_CENTS) return 0;
  const kg = Math.max(1, order.items.reduce((sum, i) => sum + Math.ceil(i.grams / 1000), 0));
  return kg * RATE_PER_KG[order.zone];
}

export function rewrittenShippingV2(order: Order): number {
  const subtotal = order.items.reduce((sum, i) => sum + i.priceCents, 0);
  if (order.zone === "domestic" && subtotal >= FREE_SHIPPING_CENTS) return 0;
  const grams = order.items.reduce((sum, i) => sum + i.grams, 0);
  return Math.max(1, Math.ceil(grams / 1000)) * RATE_PER_KG[order.zone];
}
