// A copy of the statement PDF code from before the clean-up: the August switch to the new renderer is done,
// but the flag check and the old branch are still here. lint-flags.ts fails on this directory.
type Flags = { getBooleanValue(key: string, def: boolean, ctx: object): Promise<boolean> };

export async function renderStatementPdf(flags: Flags, member: string): Promise<string> {
  if (await flags.getBooleanValue("legacy-pdf-renderer", false, { targetingKey: member })) {
    return `old renderer for ${member}`;
  }
  return `new renderer for ${member}`;
}
