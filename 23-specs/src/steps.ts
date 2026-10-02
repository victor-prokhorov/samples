import { AfterAll, Before, Given, Then, When, World, setWorldConstructor } from "@cucumber/cucumber";
import { pool } from "./db.js";
import { BankDetailsService, RuleViolation } from "./service.js";
import { domain } from "./bank-details.js";
import { naive } from "./naive.js";

function expect(actual: unknown, expected: unknown, what: string) {
  if (actual !== expected) throw new Error(`expected ${what} ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

class SpecWorld extends World {
  service: BankDetailsService = process.env.IMPL === "naive" ? naive : domain;
  now = new Date();
  requestId: number | null = null;
  error: string | null = null;

  async attempt(fn: () => Promise<unknown>) {
    this.error = null;
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof RuleViolation)) throw err;
      this.error = err.message;
    }
  }
}
setWorldConstructor(SpecWorld);

Before(async function () {
  await pool.query("TRUNCATE approvals, change_requests, bank_accounts, members RESTART IDENTITY CASCADE");
});

AfterAll(async function () {
  await pool.end();
});

Given("today is {word}", function (this: SpecWorld, day: string) {
  this.now = new Date(`${day}T09:30:00Z`);
});

Given("member {string} is paid {float} a month into {string}", async function (this: SpecWorld, member: string, amount: number, iban: string) {
  await pool.query("INSERT INTO members (id, monthly_amount) VALUES ($1, $2)", [member, amount]);
  await pool.query("INSERT INTO bank_accounts (member_id, iban, effective_from) VALUES ($1, $2, '2020-01-01')", [member, iban]);
});

async function request(world: SpecWorld, by: string, member: string, iban: string, from: string) {
  await world.attempt(async () => {
    world.requestId = await world.service.requestChange({ memberId: member, requestedBy: by, iban, effectiveFrom: from }, world.now);
  });
}

Given("{string} requests to be paid into {string} from {word}", async function (this: SpecWorld, member: string, iban: string, from: string) {
  await request(this, member, member, iban, from);
});

Given(
  "{string} requests on behalf of {string} to be paid into {string} from {word}",
  async function (this: SpecWorld, by: string, member: string, iban: string, from: string) {
    await request(this, by, member, iban, from);
  },
);

When("{string} approves the request", async function (this: SpecWorld, approver: string) {
  if (!this.requestId) throw new Error("no request was recorded");
  await this.attempt(() => this.service.approve(this.requestId!, approver, this.now));
});

Then("the request is {string}", async function (this: SpecWorld, status: string) {
  if (!this.requestId) throw new Error(`no request was recorded: refused with "${this.error}"`);
  expect(await this.service.status(this.requestId), status, "status");
});

Then(/^the (?:request|approval) is refused with "([^"]*)"$/, function (this: SpecWorld, message: string) {
  expect(this.error, message, "refusal");
});

Then("on {word} {string} is paid into {string}", async function (this: SpecWorld, day: string, member: string, iban: string) {
  expect(await this.service.accountOn(member, day), iban, "account");
});

