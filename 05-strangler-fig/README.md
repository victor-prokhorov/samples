# 05-strangler-fig

**Pain: big-bang cutover.** Replacing a whole system in one switch is all-or-nothing: months without shipping, then one risky day with no easy way back.

**Reach for it when** replacing a large live system incrementally, when traffic can be routed by capability (URL, message type) and each piece can move on its own.

**Do not reach for it when** the system is small enough to replace in one release. The capability sits deep inside the monolith with no seam to route on: use branch by abstraction there. You would move the code but leave the shared database in place: plan the data move too (08, 09), or the coupling stays. There is no commitment to finish: a half-strangled system runs two stacks forever.

Strangler fig with three real HTTP servers (`src/servers.ts`): a legacy monolith on `:53001`, a new service on `:53002`, and a routing proxy on `:53000` that clients call. `PUT /_proxy/routes` changes routing at runtime; unmatched paths fall through to legacy. The demo moves `/orders`, rolls back, then moves everything, checking each response against legacy's recorded contract and counting legacy traffic. No infra.

```sh
npm i
npm start
```

One-shot run with proof: `../run-05-strangler-fig.sh` (log in `../logs/05-strangler-fig.log`). Concepts explained in `../README.md`.
