import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const router = express.Router();

// ─── Positions ──────────────────────────────────────────────────────────
router.get("/positions", async (req, res, next) => {
  try {
    const status = req.query.status;
    const positions = await prisma.paperPosition.findMany({
      where: {
        userId: req.user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { openedAt: "desc" },
      take: 500,
    });
    res.json({ positions });
  } catch (err) { next(err); }
});

// ─── Orders ─────────────────────────────────────────────────────────────
router.get("/orders", async (req, res, next) => {
  try {
    const orders = await prisma.paperOrder.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ orders });
  } catch (err) { next(err); }
});

// POST /api/paper/orders — place a simulated order
const OrderSchema = z.object({
  coinId: z.string().min(1).max(80),
  symbol: z.string().min(1).max(20),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT", "STOP"]),
  quantity: z.number().positive().max(1e12),
  price: z.number().positive().max(1e12).optional(),     // LIMIT/STOP need price
  currentMarketPrice: z.number().positive().max(1e12),    // client-reported, used for MARKET fills
  leverage: z.number().min(1).max(100).optional().default(1),
});

router.post("/orders", async (req, res, next) => {
  try {
    const parsed = OrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const { coinId, symbol, side, type, quantity, price, currentMarketPrice, leverage } = parsed.data;

    // For market orders fill immediately at client-reported price
    const fills = type === "MARKET";
    const fillPrice = fills ? currentMarketPrice : null;

    const order = await prisma.paperOrder.create({
      data: {
        userId: req.user.id,
        coinId, symbol: symbol.toLowerCase(),
        side, type,
        quantity, price: price ?? null,
        status: fills ? "FILLED" : "PENDING",
        filledAt: fills ? new Date() : null,
        fillPrice,
      },
    });

    // If filled, create or adjust a position
    if (fills) {
      const positionSide = side === "BUY" ? "LONG" : "SHORT";
      // Compute liquidation price (simple — margin call at -80% on margin)
      const liqPct = 0.8 / (leverage || 1);
      const liquidationPrice = positionSide === "LONG"
        ? currentMarketPrice * (1 - liqPct)
        : currentMarketPrice * (1 + liqPct);

      await prisma.paperPosition.create({
        data: {
          userId: req.user.id,
          coinId, symbol: symbol.toLowerCase(),
          side: positionSide,
          size: quantity,
          entryPrice: currentMarketPrice,
          leverage: leverage || 1,
          liquidationPrice,
          status: "OPEN",
        },
      });
    }

    res.status(201).json({ order });
  } catch (err) { next(err); }
});

// DELETE /api/paper/orders/:id — cancel a pending order
router.delete("/orders/:id", async (req, res, next) => {
  try {
    const order = await prisma.paperOrder.findFirst({
      where: { id: req.params.id, userId: req.user.id, status: "PENDING" },
    });
    if (!order) return res.status(404).json({ error: "Order not found or not cancellable" });

    const updated = await prisma.paperOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    res.json({ order: updated });
  } catch (err) { next(err); }
});

// ─── Close a position ───────────────────────────────────────────────────
const CloseSchema = z.object({ currentMarketPrice: z.number().positive().max(1e12) });
router.post("/positions/:id/close", async (req, res, next) => {
  try {
    const parsed = CloseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const pos = await prisma.paperPosition.findFirst({
      where: { id: req.params.id, userId: req.user.id, status: "OPEN" },
    });
    if (!pos) return res.status(404).json({ error: "Position not open" });

    // Realized PnL = size × (exit - entry) × (LONG ? 1 : -1) × leverage
    const exit = parsed.data.currentMarketPrice;
    const entry = Number(pos.entryPrice);
    const size = Number(pos.size);
    const lev = Number(pos.leverage);
    const direction = pos.side === "LONG" ? 1 : -1;
    const realized = size * (exit - entry) * direction * lev;

    const updated = await prisma.paperPosition.update({
      where: { id: pos.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        exitPrice: exit,
        realizedPnl: realized,
      },
    });
    res.json({ position: updated });
  } catch (err) { next(err); }
});

// ─── Summary ────────────────────────────────────────────────────────────
// GET /api/paper/summary — aggregate stats for dashboard display
router.get("/summary", async (req, res, next) => {
  try {
    const [open, closed] = await Promise.all([
      prisma.paperPosition.findMany({
        where: { userId: req.user.id, status: "OPEN" },
      }),
      prisma.paperPosition.findMany({
        where: { userId: req.user.id, status: "CLOSED" },
      }),
    ]);
    const totalRealized = closed.reduce((s, p) => s + Number(p.realizedPnl || 0), 0);
    const winning = closed.filter(p => Number(p.realizedPnl || 0) > 0).length;
    const losing = closed.filter(p => Number(p.realizedPnl || 0) < 0).length;
    res.json({
      openCount: open.length,
      closedCount: closed.length,
      totalRealizedPnl: totalRealized,
      winRate: closed.length ? winning / closed.length : 0,
      winning, losing,
    });
  } catch (err) { next(err); }
});
