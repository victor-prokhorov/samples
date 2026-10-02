import { Handler, Order, Service } from "./bus.js";
import { inventoryDb, ordersDb, paymentsDb, shippingDb, tx } from "./db.js";

const RANK: Record<string, number> = { pending: 0, reserved: 1, paid: 2, completed: 3, rejected: 3 };

function advance(to: string): Handler {
  return async (c, e) => {
    const { rows } = await c.query<{ status: string }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [e.orderId]);
    const from = rows[0].status;
    if (RANK[to] <= RANK[from]) return { effect: `order is already ${from}, a late ${e.type} cannot move it back to ${to}, ignored` };
    await c.query("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1", [e.orderId, to]);
    const jumped = RANK[to] - RANK[from] > 1 && to !== "rejected" ? " (jumped: an earlier event has not arrived yet)" : "";
    return { effect: `order ${from} -> ${to}${jumped}` };
  };
}

const release: Handler = async (c, e) => {
  const { rows } = await c.query<{ sku: string; qty: number }>("DELETE FROM reservations WHERE order_id = $1 RETURNING sku, qty", [e.orderId]);
  if (!rows[0]) return { effect: "nothing reserved, nothing to release" };
  await c.query("UPDATE stock SET available = available + $2 WHERE sku = $1", [rows[0].sku, rows[0].qty]);
  return { effect: `released ${rows[0].qty} ${rows[0].sku}`, emit: "InventoryReleased" };
};

export const SERVICES: Service[] = [
  {
    name: "orders",
    topic: "order-events",
    db: ordersDb,
    emits: ["OrderPlaced"],
    on: {
      InventoryReserved: advance("reserved"),
      PaymentCharged: advance("paid"),
      ShipmentCreated: advance("completed"),
      PaymentFailed: advance("rejected"),
      ShipmentFailed: advance("rejected"),
    },
  },
  {
    name: "inventory",
    topic: "inventory-events",
    db: inventoryDb,
    emits: ["InventoryReserved", "InventoryReleased"],
    on: {
      OrderPlaced: async (c, e) => {
        await c.query("INSERT INTO reservations VALUES ($1, $2, $3)", [e.orderId, e.order.sku, e.order.qty]);
        await c.query("UPDATE stock SET available = available - $2 WHERE sku = $1", [e.order.sku, e.order.qty]);
        return { effect: `reserved ${e.order.qty} ${e.order.sku}`, emit: "InventoryReserved" };
      },
      PaymentFailed: release,
      PaymentRefunded: release,
    },
  },
  {
    name: "payments",
    topic: "payment-events",
    db: paymentsDb,
    emits: ["PaymentCharged", "PaymentFailed", "PaymentRefunded"],
    on: {
      InventoryReserved: async (c, e) => {
        if (Number(e.order.amount) > 1000) return { effect: `card declined for ${e.order.amount}`, emit: "PaymentFailed" };
        await c.query("INSERT INTO charges VALUES ($1, $2, 'charged')", [e.orderId, e.order.amount]);
        return { effect: `charged ${e.order.amount}`, emit: "PaymentCharged" };
      },
      ShipmentFailed: async (c, e) => {
        await c.query("UPDATE charges SET status = 'refunded' WHERE order_id = $1 AND status = 'charged'", [e.orderId]);
        return { effect: `refunded ${e.order.amount}`, emit: "PaymentRefunded" };
      },
    },
  },
  {
    name: "shipping",
    topic: "shipping-events",
    db: shippingDb,
    emits: ["ShipmentCreated", "ShipmentFailed"],
    on: {
      PaymentCharged: async (c, e) => {
        if (e.order.address === "nowhere") return { effect: `address not deliverable: ${e.order.address}`, emit: "ShipmentFailed" };
        await c.query("INSERT INTO shipments VALUES ($1, $2)", [e.orderId, e.order.address]);
        return { effect: `shipment to ${e.order.address}`, emit: "ShipmentCreated" };
      },
    },
  },
];

export function placeOrder(id: string, o: Order) {
  console.log(`      -> HTTP POST orders-service/orders/${id} ${JSON.stringify(o)}`);
  return tx(ordersDb, async (c) => {
    await c.query("INSERT INTO orders (id, status) VALUES ($1, 'pending')", [id]);
    await c.query("INSERT INTO outbox (order_id, type, payload) VALUES ($1, 'OrderPlaced', $2)", [id, o]);
    console.log(`   [orders] ${id} pending, outbox <- OrderPlaced; the HTTP call returns here, the rest happens by events`);
  });
}
