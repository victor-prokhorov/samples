import { Experiment } from "./scientist.js";
import { check } from "./check.js";
import { Order, legacyShipping, rewrittenShippingV1, rewrittenShippingV2 } from "./shipping.js";

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function traffic(random: () => number, count: number): Order[] {
  const zones = ["domestic", "eu", "world"] as const;
  return Array.from({ length: count }, () => ({
    zone: zones[Math.floor(random() * zones.length)],
    items: Array.from({ length: Math.floor(random() * 5) }, (_, i) => ({
      sku: `sku-${i}`,
      grams: 100 + Math.floor(random() * 1400),
      priceCents: [1000, 1500, 2000, 2500, 5000][Math.floor(random() * 5)],
    })),
  }));
}

function serve(orders: Order[], quote: (o: Order) => number) {
  return orders.reduce((sum, o) => sum + quote(o), 0);
}

function main() {
  const random = mulberry32(42);
  const orders = traffic(random, 1000);
  const legacyRevenue = serve(orders, legacyShipping);
  step("1. Parallel run against the rewrite", "every request runs legacy (control) and rewrite (candidate); callers always get the control result");
  const first = new Experiment("shipping-v1", legacyShipping, rewrittenShippingV1, random);
  const servedV1 = serve(orders, (o) => first.run(o));
  first.report();
  console.log(`   users unaffected: served total ${servedV1} === legacy total ${legacyRevenue}: ${servedV1 === legacyRevenue}`);
  check("the buggy rewrite disagrees on some orders", first.runs === 1000 && first.mismatches.length > 0);
  check("callers still got the legacy answer for every order", servedV1 === legacyRevenue);
  step("2. Read the mismatches", "each mismatch is a real input where the rewrite disagrees; group them to find the bug");
  const thrown = first.mismatches.filter((m) => m.candidate.error);
  const freeEdge = first.mismatches.filter((m) => !m.candidate.error && m.control.value === 0).length;
  const weightRounding = first.mismatches.length - thrown.length - freeEdge;
  console.log(`   ${thrown.length} candidate exceptions, swallowed by the experiment: "${thrown[0]?.candidate.error}" (legacy quotes empty carts at the 1 kg minimum)`);
  console.log(`   ${freeEdge} at exactly the free-shipping threshold: legacy uses >= 5000, rewrite uses > 5000`);
  console.log(`   ${weightRounding} from weight rounding: legacy rounds the order total up to kg, rewrite rounds each item`);
  const sample = first.mismatches.find((m) => !m.candidate.error && m.control.value !== 0);
  if (sample) console.log(`   example: ${JSON.stringify(sample.input)} -> control ${sample.control.value}, candidate ${sample.candidate.value}`);
  check("the mismatches fall into three bugs, each seen at least once", thrown.length > 0 && freeEdge > 0 && weightRounding > 0);
  check("every candidate exception was swallowed and is the empty-cart one", thrown.every((m) => m.candidate.error === "order has no items" && m.input.items.length === 0));
  step("3. Fix the candidate and run again", "keep running until mismatches are zero on real traffic; only then is the rewrite trusted");
  const second = new Experiment("shipping-v2", legacyShipping, rewrittenShippingV2, random);
  serve(orders, (o) => second.run(o));
  second.report();
  check("the fixed rewrite matches legacy on all 1000 orders", second.runs === 1000 && second.mismatches.length === 0);
  step("4. Cut over", "swap control and candidate: the rewrite now serves, legacy keeps running as the check, then it is deleted");
  const cutover = new Experiment("shipping-cutover", rewrittenShippingV2, legacyShipping, random);
  const servedV2 = serve(orders, (o) => cutover.run(o));
  cutover.report();
  console.log(`   served total ${servedV2} === legacy total ${legacyRevenue}: ${servedV2 === legacyRevenue}`);
  check("after the cutover the rewrite serves, legacy as the check finds no mismatch, and revenue is unchanged", cutover.mismatches.length === 0 && servedV2 === legacyRevenue);
}

main();
