import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { SiweMessage } from "siwe";
import { prisma } from "../lib/prisma.js";

export const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me-in-production";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// POST /api/auth/nonce — mint a random nonce for SIWE signing
router.post("/nonce", async (_req, res, next) => {
  try {
    const nonce = crypto.randomBytes(16).toString("hex");
    await prisma.siweNonce.create({ data: { nonce } });
    res.json({ nonce });
  } catch (err) { next(err); }
});

// POST /api/auth/verify — verify a SIWE signature, mint a session
// Body: { message: string, signature: string }
router.post("/verify", async (req, res, next) => {
  try {
    const { message, signature } = req.body || {};
    if (!message || !signature) {
      return res.status(400).json({ error: "Missing message or signature" });
    }

    const siwe = new SiweMessage(message);
    const result = await siwe.verify({ signature });

    if (!result.success) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const { address, chainId, nonce } = result.data;

    // Check nonce — must exist and be unconsumed
    const stored = await prisma.siweNonce.findUnique({ where: { nonce } });
    if (!stored || stored.consumedAt) {
      return res.status(401).json({ error: "Invalid or replayed nonce" });
    }
    // Consume nonce — atomic update
    await prisma.siweNonce.update({
      where: { nonce },
      data: { address: address.toLowerCase(), consumedAt: new Date() },
    });

    // Upsert user
    const user = await prisma.user.upsert({
      where: { address: address.toLowerCase() },
      update: { lastSeenAt: new Date(), chainId },
      create: { address: address.toLowerCase(), chainId },
    });

    // Mint JWT
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: (req.headers["x-forwarded-for"] || req.ip || "").toString(),
      },
    });

    res.json({
      token,
      user: {
        id: user.id,
        address: user.address,
        displayName: user.displayName,
        chainId: user.chainId,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — revoke current session
router.post("/logout", async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await prisma.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});
