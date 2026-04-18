#!/usr/bin/env node
/**
 * Helper: generates a .env file from .env.example with a randomly-generated
 * JWT_SECRET pre-filled. Run once after cloning:
 *
 *   node setup-env.js
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
const examplePath = path.join(__dirname, ".env.example");

if (fs.existsSync(envPath)) {
  console.log(".env already exists; refusing to overwrite. Delete it first if you want to regenerate.");
  process.exit(0);
}
if (!fs.existsSync(examplePath)) {
  console.log(".env.example not found. Run this from the backend directory.");
  process.exit(1);
}

const template = fs.readFileSync(examplePath, "utf8");
const secret = crypto.randomBytes(48).toString("base64");
const out = template.replace(
  /^JWT_SECRET=.*$/m,
  `JWT_SECRET="${secret}"`
);

fs.writeFileSync(envPath, out);
console.log("✓ .env created with a fresh JWT_SECRET.");
console.log("  Review the other values (DATABASE_URL, CORS_ORIGIN) before running.");
