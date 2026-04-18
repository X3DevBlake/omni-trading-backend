import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { router as authRouter } from "./routes/auth.js";
import { router as watchlistRouter } from "./routes/watchlist.js";
import { router as paperRouter } from "./routes/paper.js";
import { router as preferencesRouter } from "./routes/preferences.js";
import { router as questsRouter } from "./routes/quests.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

// Global rate limit — 300 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Health ───────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// ─── Public auth endpoints ────────────────────────────────────────────────
app.use("/api/auth", authRouter);

// ─── Authenticated endpoints (all require a valid session JWT) ─────────────
app.use("/api/watchlist", requireAuth, watchlistRouter);
app.use("/api/paper", requireAuth, paperRouter);
app.use("/api/preferences", requireAuth, preferencesRouter);
app.use("/api/quests", requireAuth, questsRouter);

// ─── 404 fallback ─────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(err.status || 500).json({
    error: err.publicMessage || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`Omni backend listening on :${PORT}`);
});
