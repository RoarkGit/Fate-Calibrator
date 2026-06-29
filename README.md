# Fate Calibrator

A Discord bot that renders a monthly event calendar as a pinned image in a designated channel, driven by Discord Scheduled Events. Designed for raid/gaming groups that need a clear at-a-glance view of upcoming sessions.

## Features

- Renders a monthly PNG calendar image from Discord Scheduled Events
- Supports one-off, recurring, and cancelled events with visual differentiation
- Persists event history (completions, cancellations, ad-hoc events) for up to 90 days in SQLite
- Per-user timezone display via a button on the calendar image
- Month navigation with forward/back buttons
- Automatic daily rebuild and scheduled updates
- Deploys as a Docker container; image published to GHCR via GitHub Actions

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Application (client) ID |
| `GUILD_ID` | Server ID where the bot operates |
| `CALENDAR_CHANNEL_ID` | Channel ID where the calendar image is pinned |
| `SERVER_TIMEZONE` | IANA timezone for server-local display (e.g. `America/New_York`) |
| `DATA_DIR` | Directory for the SQLite database (defaults to `process.cwd()` in dev, `/app/data` in Docker) |

## Slash Commands

| Command | Description |
|---|---|
| `/timezone set <tz>` | Register your personal timezone (supports any IANA name via autocomplete) |
| `/timezone get` | Show your currently registered timezone |
| `/cancel <event_id> [date]` | Manually mark an event or occurrence as cancelled |

## Development Setup

**Prerequisites:** Node.js 22+, pnpm

```sh
cp .env.example .env   # fill in your values
pnpm install
pnpm run dev           # ts-node watch mode
```

Build for production:

```sh
pnpm run build         # compiles TypeScript to dist/
pnpm start             # runs dist/index.js
```

Lint and format:

```sh
pnpm lint
pnpm format
```

## Docker Deployment (Unraid)

The GitHub Actions workflow (`.github/workflows/publish.yml`) builds and pushes a `linux/amd64` image to GHCR on every push to `main`.

**On Unraid:**

1. In the Docker tab, add a new container:
   - **Repository:** `ghcr.io/roarkgit/fate-calibrator:latest`
   - **Network:** bridge
2. Add environment variables (all the vars from the table above).
3. Add a path mapping: Container Path `/app/data` -> a host path of your choice (stores `timezones.db`).
4. Apply and start.

The bot will register slash commands and pin the calendar image on first run.

## Architecture

```
src/
  bot.ts            - Discord client setup and event listeners
  index.ts          - Entry point
  scheduler.ts      - node-cron daily rebuild job
  types.ts          - Shared types + discord.js module augmentation
  calendar/
    events.ts       - Fetch, expand, and cache scheduled events
    render.ts       - Canvas-based PNG rendering
    cache.ts        - In-memory buffer cache + Discord component builders
  commands/
    timezone.ts     - /timezone command
    cancel.ts       - /cancel command
  data/
    timezones.ts    - Curated IANA timezone list for autocomplete
  db/
    timezones.ts    - better-sqlite3 persistence layer
  interactions/
    buttons.ts      - Button and select menu interaction handler
```
