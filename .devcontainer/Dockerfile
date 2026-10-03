# Node 22 with the command-line tools the run scripts use, and the Chromium that samples 21, 22, 30 and 32 drive.
FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

RUN apt-get update \
 && export DEBIAN_FRONTEND=noninteractive \
 && apt-get install -y --no-install-recommends jq rsync curl perl unzip poppler-utils postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# Playwright 1.56.1 is the version every sample pins; one shared browser directory for all of them.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN npx -y playwright@1.56.1 install --with-deps chromium \
 && chmod -R a+rX /opt/pw-browsers
