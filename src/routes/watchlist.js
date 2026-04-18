import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const router = express.Router();

// GET /api/watchlist — list current user's watchlist
router.get("/", async (req, res, next) => {
  try {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.user.id },
      orderBy: { position: "asc" },
    });
    res.json({ items });
  } catch (err) { next(err); }
});

// POST /api/watchlist — add a coin
const AddSchema = z.object({
  coinId: z.string().min(1).max(80),
  symbol: z.string().min(1).max(20),
});
router.post("/", async (req, res, next) => {
  try {
    const parsed = AddSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    // Get current max position
    const count = await prisma.watchlistItem.count({ where: { userId: req.user.id } });

    const item = await prisma.watchlistItem.upsert({
      where: { userId_coinId: { userId: req.user.id, coinId: parsed.data.coinId } },
      update: {},  // no-op on duplicate
      create: {
        userId: req.user.id,
        coinId: parsed.data.coinId,
        symbol: parsed.data.symbol.toLowerCase(),
        position: count,
      },
    });
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

// DELETE /api/watchlist/:coinId
router.delete("/:coinId", async (req, res, next) => {
  try {
    await prisma.watchlistItem.deleteMany({
      where: { userId: req.user.id, coinId: req.params.coinId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/watchlist/reorder — body: { coinIds: string[] } new order
const ReorderSchema = z.object({ coinIds: z.array(z.string()).max(500) });
router.put("/reorder", async (req, res, next) => {
  try {
    const parsed = ReorderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    await prisma.$transaction(parsed.data.coinIds.map((coinId, i) =>
      prisma.watchlistItem.updateMany({
        where: { userId: req.user.id, coinId },
        data: { position: i },
      })
    ));
    res.json({ ok: true });
  } catch (err) { next(err); }
});
