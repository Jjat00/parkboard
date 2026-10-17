# Parkboard Autopilot

Works the Parkboard cards you tag `auto` and opens a **draft** pull request for each one. It never merges anything but trivial changes (see below).

## How a card gets picked

0. **Scout:** at the start of each run Autopilot also looks at up to 3 pending cards nobody tagged (`AUTOPILOT_SCOUT_MAX`, 0 turns it off). If they pass the fixed gate and the triage is sure (9/10, `AUTOPILOT_SCOUT_MIN_SCORE`), it tags them `auto` itself, with a note saying why; the others get `auto-revisada` so they are not judged again every hour (remove it to ask for a new look). Its own notes never count as your instructions: the gate, the triage and the agent read only what a person wrote.

1. **Opt-in:** the card has the tag `auto`, is `pending`, is a `task` or `bug`, is not `urgent`, has a `repo`, and that repo is listed in `repos.json` with its verifiers. Cards that mention secrets, production, deploys, money, migrations, deleting or deciding are handed back.
2. **Triage:** a small model with no tools scores whether the card can be done without you (≥ 8/10, clear acceptance criteria, small, reversible, nothing needed from you).
3. **Work:** the repo is cloned into a private copy and a copy for the agent. The agent (`claude -p` with Claude Opus 5.5 by default, allow-listed tools, no web tools) edits its own copy; in the container it runs as a separate Unix user and never sees the GitHub token.
4. **Checks:** on the exact commit to publish, built in a clean clone after every agent process is killed: forbidden paths (`.env*`, migrations, CI, Dockerfiles, lockfiles…), size (15 files, 500 lines), binaries, patch size, the repo's verifiers (fresh clone, fresh HOME), and a judge model that compares the diff with the card.
5. **PR:** that same commit is pushed to `autopilot/<n>-<run id>` and opened as a draft for you to review.
6. **Straight to main, for trivial changes only:** when the triage and the judge both call the change trivial (a typo, a text, docs, a comment, an obvious one- or two-line fix with no other effect) and the fixed rules agree (the repo has `"autoMerge": true`, at most 3 existing files modified and 20 lines, no new or deleted files, nothing that configures builds or dependencies), the PR is squash-merged at once, pinned to the verified commit, and the card is closed with the tag `auto-main`. Every such change is still a PR you can revert. `AUTOPILOT_DIRECT=false` turns this off.

While a run works a card it holds it with one tag, `auto-en-curso-<id>-<repo>`, and the card is `doing`; close it, move it, remove `auto` or change its repo to cancel the run before it publishes. The outcome goes back on the card: tag `auto-pr` with the PR link, or `auto-bloqueada` with the reason in the notes. A run that dies is recovered after its lease (3 h): its PR is linked, or the card is handed back. To retry a blocked card, fix it, remove `auto-bloqueada` and add `auto` again. If the Claude plan hits its usage limit, the card is left untouched for the next run.

Every run also follows the PRs it opened. Once GitHub says one was merged, `auto-pr` becomes `auto-pr-fusionado` and the card is closed; closed without merging, it becomes `auto-pr-cerrado` and a card still `doing` goes back to pending (without `auto`, so it is not retried on its own).

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

The Parkboard dashboard (`/dashboard`) has an Autopilot panel: how many cards are queued, being worked, waiting on your review, merged or handed back, with each card's PR and Autopilot's last note.
