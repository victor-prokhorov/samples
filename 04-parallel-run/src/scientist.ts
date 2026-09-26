import { isDeepStrictEqual } from "node:util";

export type Observation<T> = { value?: T; error?: string };

export type Mismatch<I, T> = { input: I; control: Observation<T>; candidate: Observation<T> };

function observe<I, T>(fn: (input: I) => T, input: I): Observation<T> {
  try {
    return { value: fn(input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export class Experiment<I, T> {
  runs = 0;
  mismatches: Mismatch<I, T>[] = [];

  constructor(
    readonly name: string,
    readonly control: (input: I) => T,
    readonly candidate: (input: I) => T,
    readonly random: () => number,
  ) {}

  run(input: I): T {
    const candidateFirst = this.random() < 0.5;
    const candidate = candidateFirst ? observe(this.candidate, input) : undefined;
    const control = observe(this.control, input);
    const cand = candidate ?? observe(this.candidate, input);
    this.runs++;
    if (control.error !== cand.error || !isDeepStrictEqual(control.value, cand.value)) this.mismatches.push({ input, control, candidate: cand });
    if (control.error) throw new Error(control.error);
    return control.value as T;
  }

  report() {
    const errors = this.mismatches.filter((m) => m.candidate.error && !m.control.error).length;
    console.log(`   experiment "${this.name}": ${this.runs} runs, ${this.mismatches.length} mismatches (${errors} candidate exceptions)`);
  }
}
