import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/index.js";

const meta = { title: "Components/Button", component: Button, args: { children: "Save changes" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Cancel" } };
export const Danger: Story = { args: { variant: "danger", children: "Remove beneficiary" } };
