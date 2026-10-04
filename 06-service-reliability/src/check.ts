// Self-checks: each claim the README makes is stated as check(label, condition).
// A failed check does not stop the story (the log shows every failure), but it marks
// the process as failed: exit code 1, so the run script fails with it.
const failed: string[] = [];
let passed = 0;

export function check(label: string, condition: boolean) {
  if (condition) passed++;
  else {
    failed.push(label);
    process.exitCode = 1;
  }
  console.log(`   ${condition ? "check ok" : "CHECK FAILED"}: ${label}`);
}

process.on("exit", () => {
  if (passed + failed.length === 0) return;
  if (failed.length) {
    console.log(`\nFAILED: ${failed.length} of ${passed + failed.length} checks: ${failed.join("; ")}`);
    process.exitCode = 1;
  } else console.log(`\n${passed} check${passed === 1 ? "" : "s"} passed`);
});
