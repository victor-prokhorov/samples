import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Card } from "../components/index.js";

const meta = {
  title: "Components/Card",
  component: Card,
  decorators: [(Story) => <div style={{ maxWidth: "36rem" }}>{Story()}</div>],
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MemberSummary: Story = {
  args: {
    title: "Acme retirement plan",
    meta: "Member since March 2014 · member number 40021187",
    children: (
      <dl className="ds-figures">
        <div>
          <dt>Balance</dt>
          <dd>€48,210</dd>
        </div>
        <div>
          <dt>Paid this year</dt>
          <dd>€3,960</dd>
        </div>
        <div>
          <dt>Employer share</dt>
          <dd>60%</dd>
        </div>
      </dl>
    ),
    footer: (
      <>
        <span>Updated 30 September 2026</span>
        <Button variant="secondary">Download statement</Button>
      </>
    ),
  },
};

export const Plain: Story = { args: { title: "Globex savings plan", meta: "Closed to new contributions", children: <p className="ds-muted">You left Globex in 2021. Your savings stay invested until you claim them.</p> } };
