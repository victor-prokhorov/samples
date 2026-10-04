import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextField } from "../components/index.js";

const meta = {
  title: "Components/TextField",
  component: TextField,
  args: { label: "Email address", name: "email", type: "email", autoComplete: "email" },
  decorators: [(Story) => <div style={{ maxWidth: "24rem" }}>{Story()}</div>],
} satisfies Meta<typeof TextField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { label: "Member number", name: "member", type: "text", autoComplete: "off", hint: "8 digits, on your annual statement", defaultValue: "40021187" } };
export const WithError: Story = {
  args: { label: "IBAN", name: "iban", type: "text", autoComplete: "off", hint: "Starts with two letters, for example FR76", error: "Enter an IBAN with 27 characters", defaultValue: "FR76 3000 6000 0112" },
};
export const Optional: Story = { args: { label: "Phone number", name: "phone", type: "tel", autoComplete: "tel", optional: true } };
