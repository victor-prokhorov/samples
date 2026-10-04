// The local copy, in Postgres. Domain tables (members, employers) hold domain values only;
// the integration's bookkeeping (source ids, versions, the mark, the inbox, the quarantine) lives beside them.
import pg from "pg";
import type { Employer, Member } from "../domain/model.js";
import type { Incoming, SourceEvent, SourceRef } from "../domain/ports.js";

export type Applied = "applied" | "unchanged" | "removed" | "rejected";

export class Store {
  constructor(readonly db: pg.Pool) {}

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  // Version guard: a link only moves forward, so an old or repeated change is a no-op. force = reconciliation repair.
  private async link(c: pg.PoolClient, entity: string, ref: SourceRef, key: string, force = false) {
    const r = await c.query(
      `INSERT INTO source_links (entity, source_id, local_key, version, changed_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entity, source_id) DO UPDATE SET local_key = EXCLUDED.local_key, version = EXCLUDED.version, changed_at = EXCLUDED.changed_at
       WHERE source_links.version < EXCLUDED.version OR $6`,
      [entity, ref.id, key, ref.version, ref.changedAt, force],
    );
    return r.rowCount === 1;
  }

  async applyEmployer(inc: Incoming<Employer>): Promise<Applied> {
    if (inc.kind !== "upsert") return inc.kind === "rejected" ? this.quarantine("employer", inc) : "unchanged";
    return this.tx(async (c) => {
      if (!(await this.link(c, "employer", inc.ref, inc.value.ref))) return "unchanged";
      const e = inc.value;
      await c.query("INSERT INTO employers VALUES ($1, $2, $3) ON CONFLICT (ref) DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector", [e.ref, e.name, e.sector]);
      return "applied";
    });
  }

  async applyMember(inc: Incoming<Member>, force = false): Promise<Applied> {
    if (inc.kind === "rejected") return this.quarantine("member", inc);
    if (inc.kind === "removed") return this.removeBySource(inc.ref.id);
    return this.tx(async (c) => {
      if (!(await this.link(c, "member", inc.ref, inc.value.memberNo, force))) return "unchanged";
      const m = inc.value;
      await c.query(
        `INSERT INTO members VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (member_no) DO UPDATE SET given_name = EXCLUDED.given_name, family_name = EXCLUDED.family_name, email = EXCLUDED.email,
           birth_date = EXCLUDED.birth_date, status = EXCLUDED.status, employer_ref = EXCLUDED.employer_ref`,
        [m.memberNo, m.givenName, m.familyName, m.email, m.birthDate, m.status, m.employerRef],
      );
      await c.query("DELETE FROM quarantine WHERE entity = 'member' AND source_id = $1", [inc.ref.id]);
      return "applied";
    });
  }

  async removeBySource(sourceId: string): Promise<Applied> {
    return this.tx(async (c) => {
      const l = await c.query("DELETE FROM source_links WHERE entity = 'member' AND source_id = $1 RETURNING local_key", [sourceId]);
      if (!l.rowCount) return "unchanged";
      await c.query("DELETE FROM members WHERE member_no = $1", [l.rows[0].local_key]);
      return "removed";
    });
  }

  async quarantine(entity: string, inc: Extract<Incoming<unknown>, { kind: "rejected" }>): Promise<Applied> {
    await this.db.query(
      `INSERT INTO quarantine (entity, source_id, version, reasons, raw) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entity, source_id) DO UPDATE SET version = EXCLUDED.version, reasons = EXCLUDED.reasons, raw = EXCLUDED.raw, seen_at = now()`,
      [entity, inc.ref.id, inc.ref.version, inc.reasons, JSON.stringify(inc.raw)],
    );
    return "rejected";
  }

  async mark(stream: string): Promise<string | null> {
    const r = await this.db.query("SELECT mark FROM sync_marks WHERE stream = $1", [stream]);
    return r.rows[0]?.mark ? (r.rows[0].mark as Date).toISOString().replace(".000Z", "Z") : null;
  }

  async setMark(stream: string, mark: string | null) {
    await this.db.query("INSERT INTO sync_marks VALUES ($1, $2, now()) ON CONFLICT (stream) DO UPDATE SET mark = EXCLUDED.mark, updated_at = now()", [stream, mark]);
  }

  async member(no: string): Promise<{ member: Member; ref: SourceRef } | null> {
    const r = await this.db.query(
      `SELECT m.*, to_char(m.birth_date, 'YYYY-MM-DD') AS birth, l.source_id, l.version, l.changed_at
       FROM members m JOIN source_links l ON l.entity = 'member' AND l.local_key = m.member_no WHERE m.member_no = $1`,
      [no],
    );
    if (!r.rowCount) return null;
    const x = r.rows[0];
    return { member: toMember(x), ref: { id: x.source_id, version: Number(x.version), changedAt: x.changed_at.toISOString() } };
  }

  async members(): Promise<Array<Member & { sourceId: string }>> {
    const r = await this.db.query(
      `SELECT m.*, to_char(m.birth_date, 'YYYY-MM-DD') AS birth, l.source_id FROM members m
       LEFT JOIN source_links l ON l.entity = 'member' AND l.local_key = m.member_no ORDER BY m.member_no`,
    );
    return r.rows.map((x) => ({ ...toMember(x), sourceId: x.source_id }));
  }

  // The inbox: one row per event id. A repeated delivery only bumps the counter; outcome stays NULL until processed,
  // so a delivery whose processing failed is processed again on the next attempt.
  async receive(e: SourceEvent, signedAt: number): Promise<{ deliveries: number; outcome: string | null }> {
    const r = await this.db.query(
      `INSERT INTO webhook_inbox (event_id, source_id, signed_at) VALUES ($1, $2, to_timestamp($3))
       ON CONFLICT (event_id) DO UPDATE SET deliveries = webhook_inbox.deliveries + 1 RETURNING deliveries, outcome`,
      [e.eventId, e.sourceId, signedAt],
    );
    return r.rows[0];
  }

  async processed(eventId: string, outcome: string) {
    await this.db.query("UPDATE webhook_inbox SET outcome = $2, processed_at = now() WHERE event_id = $1", [eventId, outcome]);
  }

  async refused(reason: string, eventId: string | null) {
    await this.db.query("INSERT INTO webhook_refusals (reason, event_id) VALUES ($1, $2)", [reason, eventId]);
  }
}

const toMember = (x: Record<string, string>): Member => ({ memberNo: x.member_no, givenName: x.given_name, familyName: x.family_name, email: x.email, birthDate: x.birth, status: x.status as Member["status"], employerRef: x.employer_ref });
