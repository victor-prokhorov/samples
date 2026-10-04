// Stands in for a third-party tag (analytics, chat widget, A/B testing): a little main-thread work on arrival.
// The server delays it by a second, like a slow third-party host.
const until = performance.now() + 40;
let n = 0;
while (performance.now() < until) n++;
(window as unknown as { __tag: number }).__tag = n;
