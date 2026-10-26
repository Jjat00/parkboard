# Parkboard Autopilot: one run per container start (Railway cron).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 procps \
  && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.2 /uv /uvx /usr/local/bin/
RUN corepack enable && npm install -g @anthropic-ai/claude-code@2.1.301

# The agent runs as this user: it cannot read the orchestrator's environment (GitHub token),
# and pkill -u agent ends everything it started before anything is published. It has no home of
# its own: each card gets a fresh HOME, and the verifiers another one.
RUN useradd --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin agent
ENV AUTOPILOT_AGENT_USER=agent \
    AUTOPILOT_WORKDIR=/work

WORKDIR /app
COPY autopilot.mjs ./
CMD ["node", "autopilot.mjs"]
