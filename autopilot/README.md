# Parkboard Autopilot

Works the Parkboard cards you tag `auto` and opens a **draft** pull request for each one. It never merges.

## How a card gets picked

1. **Opt-in:** the card has the tag `auto`, is `pending`, is a `task` or `bug`, is not `urgent`, has a `repo`, and that repo is listed in `repos.json` with its verifiers. Cards that mention secrets, production, deploys, money, migrations, deleting or deciding are handed back.
2. **Triage:** a small model with no tools scores whether the card can be done without you (≥ 8/10, clear acceptance criteria, small, reversible, nothing needed from you).
3. **Work:** the repo is cloned into a private copy and a copy for the agent. The agent (`claude -p`, allow-listed tools, no web tools) edits its own copy; in the container it runs as a separate Unix user and never sees the GitHub token.
4. **Checks:** on the exact commit to publish, built in a clean clone after every agent process is killed: forbidden paths (`.env*`, migrations, CI, Dockerfiles, lockfiles…), size (15 files, 500 lines), binaries, patch size, the repo's verifiers (fresh clone, fresh HOME), and a judge model that compares the diff with the card.
5. **PR:** that same commit is pushed to `autopilot/<n>-<run id>` and opened as a draft.

While a run works a card it holds it with one tag, `auto-en-curso-<id>-<repo>`, and the card is `doing`; close it, move it, remove `auto` or change its repo to cancel the run before it publishes. The outcome goes back on the card: tag `auto-pr` with the PR link, or `auto-bloqueada` with the reason in the notes. A run that dies is recovered after its lease (3 h): its PR is linked, or the card is handed back. To retry a blocked card, fix it, remove `auto-bloqueada` and add `auto` again. If the Claude plan hits its usage limit, the card is left untouched for the next run.

## Run

```sh
cp .env.example .env   # fill it in
docker build -t parkboard-autopilot .
docker run --rm --env-file .env parkboard-autopilot
```

`node autopilot.mjs --dry-run` runs only the gate and triage on this machine and changes nothing. `--card 12` limits a run to one card. Without the container, a real run needs `--allow-host`, which runs the agent as your own user: use it only for development.

On Railway, deploy this directory as a service with a cron schedule (for example `0 * * * *`); each start is one run.

## Adding a repo

Add an entry to `repos.json`: `setup` (install), `verify` (must pass for a PR), `allow` (commands the agent may run) and optional `env`. A repo without verifiers is never worked.
