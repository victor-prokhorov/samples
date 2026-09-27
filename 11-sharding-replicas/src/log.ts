export function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

export function message(err: unknown): string {
  if (err instanceof AggregateError) return err.errors.map(message).join(", ");
  return err instanceof Error ? err.message : String(err);
}

export async function rejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return message(err);
  }
  throw new Error("expected a rejection, but the operation succeeded");
}
