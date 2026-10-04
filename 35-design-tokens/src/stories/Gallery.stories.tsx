import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, Button, Card, TextField } from "../components/index.js";

// Every component on one page, the way a member portal screen would use them. The screenshots in screenshots/ are of
// this story in both themes.
function MemberPage() {
  return (
    <main className="ds-stack ds-page" style={{ maxWidth: "64rem" }}>
      <div>
        <h1 className="ds-heading">Your account</h1>
        <p className="ds-muted">Alex Martin · Acme Corporation</p>
      </div>
      <Alert tone="info" title="Your 2026 statement is ready">
        It covers contributions paid by Acme up to 30 September. <a href="#statement">Read the statement</a>
      </Alert>
      <div className="ds-columns">
        <div className="ds-stack">
          <Card
            title="Acme retirement plan"
            meta="Member since March 2014 · member number 40021187"
            footer={
              <>
                <span>Updated 30 September 2026</span>
                <Button variant="secondary">Download statement</Button>
              </>
            }
          >
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
          </Card>
          <Alert tone="success" title="Address updated">
            Your next letter will go to the new address.
          </Alert>
          <Alert tone="warning" title="Beneficiary missing">
            Name at least one beneficiary.
          </Alert>
          <Alert tone="danger" title="Payment refused">
            The bank rejected the transfer on 2 October.
          </Alert>
        </div>
        <Card title="Bank details" meta="Where we pay your benefits">
          <form className="ds-stack" onSubmit={(e) => e.preventDefault()} noValidate>
            <TextField label="Account holder" name="holder" autoComplete="name" defaultValue="Alex Martin" />
            <TextField label="IBAN" name="iban" autoComplete="off" hint="Starts with two letters, for example FR76" error="Enter an IBAN with 27 characters" defaultValue="FR76 3000 6000 0112" />
            <TextField label="Reference" name="reference" autoComplete="off" optional />
            <div className="ds-row">
              <Button type="submit">Save bank details</Button>
              <Button variant="secondary">Cancel</Button>
              <Button variant="danger">Remove</Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}

const meta = { title: "Gallery", component: MemberPage, parameters: { layout: "fullscreen" } } satisfies Meta<typeof MemberPage>;
export default meta;
export const MemberAccount: StoryObj<typeof meta> = {};
