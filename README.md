# Omni Trading — Backend

Express + Prisma + Postgres backend for the Omni Trading frontend.

## What it does

- **Auth**: Sign-In With Ethereum (SIWE, EIP-4361). No passwords, no PII. Users connect
  their wallet, sign a message, and get a JWT session.
- **Watchlist**: per-user coin watchlist, ordered, persists across sessions.
- **Paper trading**: simulated positions and orders with realistic PnL math.
- **Preferences**: default view, default pair, display settings.
- **Quest progress**: XP rewards system backing the frontend's Rewards page.

It does **not** custody real funds. No real deposits or withdrawals happen through this API.
Any trading UI in the frontend is paper trading unless explicitly hitting testnet web3 directly.

## Quick start (local dev)

```bash
# Install deps
npm install

# Set up env
cp .env.example .env
# Edit .env — at minimum generate a JWT_SECRET and set DATABASE_URL

# Generate Prisma client + run migrations
npx prisma migrate dev --name init

# Start the server
npm run dev
```

The API listens on `:3001` by default.

## Quick start with SQLite (no Postgres needed)

Edit `prisma/schema.prisma` and change:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Then in `.env`:

```
DATABASE_URL="file:./dev.db"
```

And run `npx prisma migrate dev --name init`. You're up.

## API reference

All authenticated endpoints require an `Authorization: Bearer <jwt>` header.

### Auth (public)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/nonce` | Get a one-time nonce for SIWE message |
| POST | `/api/auth/verify` | Verify a signed SIWE message, receive a JWT |
| POST | `/api/auth/logout` | Revoke the current session |

### Watchlist

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/watchlist` | List user's watchlist |
| POST | `/api/watchlist` | Add `{ coinId, symbol }` |
| DELETE | `/api/watchlist/:coinId` | Remove a coin |
| PUT | `/api/watchlist/reorder` | Reorder by `{ coinIds: [...] }` |

### Paper trading

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/paper/positions?status=OPEN` | List positions |
| POST | `/api/paper/orders` | Place `{ coinId, symbol, side, type, quantity, currentMarketPrice, leverage }` |
| DELETE | `/api/paper/orders/:id` | Cancel a pending order |
| POST | `/api/paper/positions/:id/close` | Close with `{ currentMarketPrice }` |
| GET | `/api/paper/summary` | Aggregate PnL + win rate |

### Preferences

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/preferences` | Get (auto-creates defaults) |
| PUT | `/api/preferences` | Update subset |

### Quests

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/quests` | List all quests with user progress + total XP |
| POST | `/api/quests/:id/progress` | Increment by `{ delta }` |
| POST | `/api/quests/:id/claim` | Claim reward for a completed quest |

## Deployment

- **Railway / Render / Fly**: set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, deploy the
  folder. Add `npx prisma migrate deploy` to your start command so schema migrations
  run before the server boots.
- **Neon / Supabase** for the database: free tier is plenty for a portfolio project.
- Always generate a real `JWT_SECRET` in production (`node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
