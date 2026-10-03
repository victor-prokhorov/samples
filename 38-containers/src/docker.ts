// Thin wrappers over the docker CLI, so every command the demo runs is the one a reader would type.
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { type Color, DB_URL_CONTAINER, NETWORK, upstreamPort } from "./config.js";

export function docker(args: string[], opts: { echo?: boolean; input?: string } = {}): string {
  if (opts.echo) console.log(`   $ docker ${args.join(" ")}`);
  return execFileSync("docker", args, { encoding: "utf8", input: opts.input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

// Asynchronous, for commands run while the load generator is sending requests in the same process:
// a synchronous call would freeze its event loop and stretch every request it is timing.
export async function dockerAsync(args: string[], opts: { echo?: boolean } = {}): Promise<string> {
  if (opts.echo) console.log(`   $ docker ${args.join(" ")}`);
  const { stdout } = await promisify(execFile)("docker", args, { encoding: "utf8" });
  return stdout.trim();
}

// docker build with BuildKit's plain progress.
export function build(args: string[]): { ok: boolean; output: string; seconds: number } {
  console.log(`   $ docker build ${args.map((a) => (a.replace(/npm_[A-Za-z0-9]{36}/, "npm_***(masked)***"))).join(" ")}`);
  const started = Date.now();
  const r = spawnSync("docker", ["build", "--progress=plain", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, output: (r.stdout ?? "") + (r.stderr ?? ""), seconds: (Date.now() - started) / 1000 };
}

// What a build context holds once the ignore file has been applied. BuildKit only transfers what changed
// since the last build, so its "transferring context" line is not a size; copying the context into a
// throwaway image and measuring it there is. ignoreNothing: the naive build's view (its ignore file is empty).
export function contextProbe(base: string, ignoreNothing: boolean): { bytes: number; files: number; entries: string } {
  const dockerfile = `FROM ${base}\nCOPY . /ctx\nRUN echo "probe: $(du -sb /ctx | cut -f1) $(find /ctx -type f | wc -l) $(ls -A /ctx | tr '\\n' ' ')"\n`;
  let args = ["build", "--progress=plain", "--no-cache", "-f", "-", "."];
  if (ignoreNothing) {
    writeFileSync("Dockerfile.probe", dockerfile);
    writeFileSync("Dockerfile.probe.dockerignore", "# nothing ignored\n");
    args = ["build", "--progress=plain", "--no-cache", "-f", "Dockerfile.probe", "."];
  }
  try {
    const r = spawnSync("docker", args, { encoding: "utf8", input: dockerfile, maxBuffer: 64 * 1024 * 1024 });
    const m = /probe: (\d+) (\d+) (.*)/.exec((r.stdout ?? "") + (r.stderr ?? ""));
    if (!m) throw new Error(`context probe failed: ${r.stderr}`);
    const entries = m[3].trim().split(" ").filter((e) => !e.startsWith("Dockerfile.probe"));
    return { bytes: Number(m[1]), files: Number(m[2]), entries: entries.join(" ") };
  } finally {
    rmSync("Dockerfile.probe", { force: true });
    rmSync("Dockerfile.probe.dockerignore", { force: true });
  }
}

export function imageSize(image: string): number {
  // Uncompressed size on disk of everything the image needs, the number "docker images" shows.
  const line = docker(["image", "ls", "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}", image]).split("\n")[0] ?? "";
  return parseSize(line.split("\t")[1] ?? "0B");
}

export function parseSize(s: string): number {
  const m = /([\d.]+)\s*([kKMG]?B)/.exec(s);
  if (!m) return 0;
  const unit = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9 }[m[2]] ?? 1;
  return Number(m[1]) * unit;
}

export const mb = (bytes: number) => `${(bytes / 1e6).toFixed(0)} MB`;

export function runApp(color: Color, image: string, extra: string[] = []) {
  return dockerAsync(
    [
      "run", "-d", "--name", `38-containers-${color}`,
      "--network", NETWORK,
      "-p", `${upstreamPort[color]}:8080`,
      "-e", `COLOR=${color}`,
      "-e", `DATABASE_URL=${DB_URL_CONTAINER}`,
      "-e", "WARMUP_MS=1500",
      "--stop-timeout", "15",
      ...extra,
      image,
    ],
    { echo: true },
  );
}

export function removeApp(color: Color) {
  spawnSync("docker", ["rm", "-f", "-v", `38-containers-${color}`], { stdio: "ignore" });
}

export function state(color: Color): { status: string; exitCode: number; health: string } {
  const out = docker(["inspect", "--format", "{{.State.Status}} {{.State.ExitCode}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}", `38-containers-${color}`]);
  const [status, exitCode, health] = out.split(" ");
  return { status, exitCode: Number(exitCode), health };
}

export function logs(color: Color): string[] {
  const r = spawnSync("docker", ["logs", `38-containers-${color}`], { encoding: "utf8" });
  return ((r.stdout ?? "") + (r.stderr ?? "")).trim().split("\n").filter(Boolean);
}
