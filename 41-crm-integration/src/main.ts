// Composition root: the only place outside src/acl/ that knows the CRM adapter exists.
import { CrmMemberDirectory } from "./acl/adapter.js";
import { CrmClient, type RetryEvent } from "./acl/client.js";
import { verifyWebhook } from "./acl/webhook.js";
import { APP_PORT, CRM_BASE, WEBHOOK_SECRETS, db } from "./db.js";
import { startApp } from "./app/server.js";
import { Store } from "./app/store.js";

export function compose(now: () => number = Date.now, onRetry?: (e: RetryEvent) => void) {
  const client = new CrmClient({ base: CRM_BASE, pageSize: 50, onRetry });
  const dir = new CrmMemberDirectory(client, () => new Date(now()).toISOString().slice(0, 10));
  const store = new Store(db);
  const verify = (h: Record<string, string | string[] | undefined>, raw: string, nowMs: number) => verifyWebhook(h, raw, WEBHOOK_SECRETS, nowMs);
  return { client, dir, store, verify, now };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = compose();
  await startApp(APP_PORT, c);
  console.log(`app on http://localhost:${APP_PORT} (POST /webhooks/crm, GET /members/:no, POST /members/:no/email)`);
}
