// Component level: the real React component in jsdom, driven like a user (user-event), found the way a screen
// reader finds things (roles, labels, accessible descriptions), with MSW standing in for the network.
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it } from "vitest";
import { ContributionForm } from "./ContributionForm.js";
import { alice, posted, server } from "./mocks.js";

beforeEach(() => {
  posted.length = 0;
});

async function open() {
  const user = userEvent.setup();
  render(<ContributionForm memberId="M0001" />);
  await screen.findByRole("heading", { name: "Change my contribution" });
  return user;
}

it("shows who the member is and their current rate", async () => {
  await open();
  expect(screen.getByText("Alice Martin, Acme. You pay 5% of your salary today.")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Starts on" })).toHaveDisplayValue("Choose a month");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("1 November 2026");
});

it("previews the monthly amounts as the member types", async () => {
  const user = await open();
  const preview = screen.getByRole("region", { name: "Each month" });
  expect(preview).toHaveTextContent("Enter a rate to see the amounts.");
  await user.type(screen.getByRole("textbox", { name: "New rate (% of salary)" }), "8");
  expect(preview).toHaveTextContent("You pay€280.00Your employer adds€175.00Total€455.00");
});

it("shows errors tied to their fields and sends nothing", async () => {
  const user = await open();
  const rate = screen.getByRole("textbox", { name: "New rate (% of salary)" });
  await user.type(rate, "20");
  await user.click(screen.getByRole("button", { name: "Request the change" }));
  expect(rate).toBeInvalid();
  expect(rate).toHaveAccessibleDescription("Between 2 and 15, in steps of 0.5. Error: Enter a rate between 2% and 15%");
  expect(screen.getByRole("combobox", { name: "Starts on" })).toHaveAccessibleDescription("Error: Choose when the change starts");
  expect(posted).toEqual([]);
});

it("sends a valid change and announces it", async () => {
  const user = await open();
  await user.type(screen.getByRole("textbox", { name: "New rate (% of salary)" }), "6,5");
  await user.selectOptions(screen.getByRole("combobox", { name: "Starts on" }), "1 December 2026");
  await user.click(screen.getByRole("button", { name: "Request the change" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your change to 6.5% from 1 December 2026 is pending. You will pay €227.50 a month."));
  expect(posted).toEqual([{ rate: "6,5", effectiveFrom: "2026-12-01" }]);
});

it("shows the server's field errors when it refuses the change (422)", async () => {
  server.use(http.post("*/api/members/M0001/contribution-changes", () => HttpResponse.json({ errors: { effectiveFrom: "A change starts within 6 months" } }, { status: 422 })));
  const user = await open();
  await user.type(screen.getByRole("textbox", { name: "New rate (% of salary)" }), "6");
  await user.selectOptions(screen.getByRole("combobox", { name: "Starts on" }), "1 November 2026");
  await user.click(screen.getByRole("button", { name: "Request the change" }));
  expect(await screen.findByText("Error: A change starts within 6 months")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Starts on" })).toBeInvalid();
});

it("alerts when a change is already pending (409)", async () => {
  server.use(http.post("*/api/members/M0001/contribution-changes", () => HttpResponse.json({ error: "You already have a pending change. Wait for it to apply before asking for another." }, { status: 409 })));
  const user = await open();
  await user.type(screen.getByRole("textbox", { name: "New rate (% of salary)" }), "6");
  await user.selectOptions(screen.getByRole("combobox", { name: "Starts on" }), "1 November 2026");
  await user.click(screen.getByRole("button", { name: "Request the change" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You already have a pending change."));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("works with the keyboard alone: tab, type, choose, tab to the button, Enter", async () => {
  const user = await open();
  await user.tab();
  expect(screen.getByRole("textbox", { name: "New rate (% of salary)" })).toHaveFocus();
  await user.keyboard("7");
  await user.tab();
  expect(screen.getByRole("combobox", { name: "Starts on" })).toHaveFocus();
  await user.selectOptions(screen.getByRole("combobox", { name: "Starts on" }), "1 January 2027");
  await user.tab();
  expect(screen.getByRole("button", { name: "Request the change" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your change to 7% from 1 January 2027 is pending."));
});

it("disables the button while sending, so a double click sends once", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  server.use(
    http.post("*/api/members/M0001/contribution-changes", async ({ request }) => {
      posted.push(await request.json());
      await gate;
      return HttpResponse.json({ id: 1, rate: 6, effectiveFrom: "2026-11-01", status: "pending", monthly: { member: 210, employer: 175, total: 385 } }, { status: 201 });
    }),
  );
  const user = await open();
  await user.type(screen.getByRole("textbox", { name: "New rate (% of salary)" }), "6");
  await user.selectOptions(screen.getByRole("combobox", { name: "Starts on" }), "1 November 2026");
  await user.dblClick(screen.getByRole("button", { name: "Request the change" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  release();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("is pending"));
  expect(posted).toHaveLength(1);
});

it("shows a change that is already pending", async () => {
  server.use(http.get("*/api/members/M0001", () => HttpResponse.json({ ...alice, pending: { id: 9, rate: 6, effectiveFrom: "2026-11-01" } })));
  await open();
  expect(screen.getByText("A change to 6% from 1 November 2026 is pending.")).toBeInTheDocument();
});

it("says so when the member cannot be loaded", async () => {
  server.use(http.get("*/api/members/M0001", () => HttpResponse.json({ error: "No such member" }, { status: 404 })));
  render(<ContributionForm memberId="M0001" />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not load your details (404)"));
});
