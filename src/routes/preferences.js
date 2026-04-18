import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const router = express.Router();

// GET /api/preferences
router.get("/", async (req, res, next) => {
  try {
    const prefs = await prisma.userPreferences.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id },
    });
    res.json({ preferences: prefs });
  } catch (err) { next(err); }
});

// PUT /api/preferences
const PrefsSchema = z.object({
  theme: z.string().max(32).optional(),
  defaultView: z.string().max(32).optional(),
  defaultPair: z.string().max(32).optional(),
  showPortfolioBalances: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
});

router.put("/", async (req, res, next) => {
  try {
    const parsed = PrefsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const prefs = await prisma.userPreferences.upsert({
      where: { userId: req.user.id },
      update: parsed.data,
      create: { userId: req.user.id, ...parsed.data },
    });
    res.json({ preferences: prefs });
  } catch (err) { next(err); }
});
