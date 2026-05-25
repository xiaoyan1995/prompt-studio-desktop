import { db } from "./db";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateShortCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode(8);
    const exists = await db.user.findFirst({ where: { referral_code: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique referral code");
}

export async function generateUniqueShareCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode(8);
    const exists = await db.projectShare.findFirst({ where: { short_code: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique share code");
}
