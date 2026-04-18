import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const router = express.Router();

// The catalog of all available quests. Kept server-side so we control goals + XP.
const QUEST_CATALOG = [
  { id: "first-swap",    goal: 1,     xp: 100  },
  { id: "ten-trades",    goal: 10,    xp: 300  },
  { id: "provide-500",   goal: 1,     xp: 400  },
  { id: "stake-3-pools", goal: 3,     xp: 500  },
  { id: "volume-10k",    goal: 10000, xp: 750  },
  { id: "refer-5",       goal: 5,     xp: 1000 },
  { id: "hold-30-days",  goal: 30,    xp: 2000 },
];

// GET /api/quests
router.get("/", async (req, res, next) => {
  try {
    const records = await prisma.questProgress.findMany({
      where: { userId: req.user.id },
    });
    const byId = Object.fromEntries(records.map(q => [q.questId, q]));

    // Merge catalog with user's progress; create zero-progress entries for missing
    const quests = QUEST_CATALOG.map(q => ({
      id: q.id,
      xp: q.xp,
      goal: q.goal,
      progress: byId[q.id]?.progress || 0,
      completed: byId[q.id]?.completed || false,
      completedAt: byId[q.id]?.completedAt || null,
      rewardClaimed: byId[q.id]?.rewardClaimed || false,
    }));

    const totalXp = records.reduce(
      (s, q) => s + (q.completed && q.rewardClaimed ? q.xp : 0),
      0
    );
    res.json({ quests, totalXp });
  } catch (err) { next(err); }
});

// POST /api/quests/:id/progress — increment progress (e.g. after a trade)
const ProgressSchema = z.object({ delta: z.number().min(1).max(1e9) });
router.post("/:id/progress", async (req, res, next) => {
  try {
    const quest = QUEST_CATALOG.find(q => q.id === req.params.id);
    if (!quest) return res.status(404).json({ error: "Unknown quest" });

    const parsed = ProgressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const existing = await prisma.questProgress.findUnique({
      where: { userId_questId: { userId: req.user.id, questId: quest.id } },
    });
    const newProgress = Math.min(quest.goal, (existing?.progress || 0) + parsed.data.delta);
    const nowCompleted = newProgress >= quest.goal;

    const updated = await prisma.questProgress.upsert({
      where: { userId_questId: { userId: req.user.id, questId: quest.id } },
      update: {
        progress: newProgress,
        completed: nowCompleted,
        completedAt: nowCompleted && !existing?.completed ? new Date() : existing?.completedAt,
        xp: quest.xp,
        goal: quest.goal,
      },
      create: {
        userId: req.user.id, questId: quest.id,
        progress: newProgress,
        completed: nowCompleted,
        completedAt: nowCompleted ? new Date() : null,
        xp: quest.xp,
        goal: quest.goal,
      },
    });
    res.json({ quest: updated });
  } catch (err) { next(err); }
});

// POST /api/quests/:id/claim — claim reward for completed quest
router.post("/:id/claim", async (req, res, next) => {
  try {
    const record = await prisma.questProgress.findUnique({
      where: { userId_questId: { userId: req.user.id, questId: req.params.id } },
    });
    if (!record) return res.status(404).json({ error: "Quest not started" });
    if (!record.completed) return res.status(400).json({ error: "Quest not completed" });
    if (record.rewardClaimed) return res.status(400).json({ error: "Already claimed" });

    const updated = await prisma.questProgress.update({
      where: { userId_questId: { userId: req.user.id, questId: req.params.id } },
      data: { rewardClaimed: true },
    });
    res.json({ quest: updated });
  } catch (err) { next(err); }
});
