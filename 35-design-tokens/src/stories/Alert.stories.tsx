import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert } from "../components/index.js";

const meta = {
  title: "Components/Alert",
  component: Alert,
  decorators: [(Story) => <div style={{ maxWidth: "36rem" }}>{Story()}</div>],
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { tone: "info", title: "Your 2026 statement is ready", children: "It covers contributions paid by Acme up to 30 September." } };
export const Success: Story = { args: { tone: "success", title: "Address updated", children: "Your next letter will go to the new address." } };
export const Warning: Story = { args: { tone: "warning", title: "Beneficiary missing", children: "Name at least one beneficiary so the benefit goes where you want." } };
export const Danger: Story = { args: { tone: "danger", title: "Payment refused", children: "The bank rejected the transfer on 2 October. Check your IBAN." } };
