# Fallback base, used by ../run.sh ONLY when node:22-slim cannot be pulled
# (for example a CI runner behind a registry rate limit, where postgres:16 is the one image cached).
# postgres:16 is Debian with glibc, so the host's own Node 22 binary runs on it unchanged.
# It is bigger than node:22-slim (it carries PostgreSQL); a reader should build on the pinned
# node:22-slim digest in ../Dockerfile, not on this.
# Build context: a temp dir holding the host's `node` binary and its `npm` package folder.
FROM postgres:16
COPY node /usr/local/bin/node
COPY npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node \
 && node --version
# Undo what the postgres image sets for its own server.
ENTRYPOINT []
STOPSIGNAL SIGTERM
CMD ["node"]
