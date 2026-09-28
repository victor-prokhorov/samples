const STEPS: Record<string, [string, string]> = {
  "1": ["No election", "three replicas of a cron-like job (every second, insert a row into ticks): each one runs it, so the job fires three times per second"],
  "2": ["Lease in Postgres", "each replica runs one statement every second: take the scheduler row if it is expired, or extend it if it is already mine; expires_at comes from the database's now(), never a local clock; only the holder runs the job"],
  "3": ["Leader killed (kill -9)", "a dead leader cannot release anything; the followers wait until expires_at passes, so failover costs up to the TTL plus one renew interval, and the job does not run meanwhile"],
  "4": ["Leader paused right after a renew: self-fencing", "the leader freezes past its TTL; a follower takes over with a higher term; on resume, the old leader's own check (last renew sent more than a TTL ago on its monotonic clock) stops the job before any write"],
  "5": ["Paused after its check: fencing tokens", "the pause lands between the lease check and the write, so the check was true and the stale write goes out; ticks takes it (two leaders wrote), fenced_ticks rejects it because it has already seen a higher term"],
  "6": ["Graceful handover", "on SIGTERM the leader sets expires_at = now() before exiting, so a follower takes over on its next heartbeat instead of after the TTL"],
  "7": ["Session lock: pg_try_advisory_lock", "no row, no TTL: the lock lives exactly as long as the holder's database session; a paused holder keeps it (its session is alive), a killed one loses it at once (the kernel closes its socket)"],
  "8": ["Behind a transaction-mode pooler", "a pooler hands each transaction whichever server connection is free; two pooled connections stand in for it here"],
};

const step = process.argv[2] ?? "";
const [title, concept] = STEPS[step];
console.log(`\n## ${step}. ${title}\n   concept: ${concept}`);
