import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";
import { creditReferralReward } from "./billing";
import { logger } from "./logger";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.is_active || !user.password_hash) return null;

        const isValid = await compare(
          credentials.password as string,
          user.password_hash
        );
        if (!isValid) return null;

        await db.user.update({
          where: { id: user.id },
          data: { last_login_at: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.nickname,
          role: user.role,
          skipCompliance: user.skip_compliance,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          const email = user.email;
          if (!email) return false;

          const existing = await db.user.findUnique({ where: { email } });

          if (existing) {
            if (!existing.is_active) return false;
            await db.user.update({
              where: { id: existing.id },
              data: {
                last_login_at: new Date(),
                avatar_url: existing.avatar_url ?? user.image ?? null,
              },
            });
            return true;
          }

          // Read referral cookie (supports both short code and UUID)
          const cookieStore = await cookies();
          const refCode = cookieStore.get("ref")?.value || null;
          let referrerId: string | null = null;
          if (refCode) {
            const referrer = await db.user.findFirst({
              where: { OR: [{ referral_code: refCode }, { id: refCode }] },
              select: { id: true },
            });
            referrerId = referrer?.id ?? null;
          }

          // Auto-create user on first Google sign-in
          const newUser = await db.$transaction(async (tx) => {
            const { generateUniqueReferralCode } = await import("@/lib/short-code");
            const referralCode = await generateUniqueReferralCode();
            const created = await tx.user.create({
              data: {
                email,
                nickname: user.name ?? email.split("@")[0],
                avatar_url: user.image ?? null,
                email_verified: true,
                referral_code: referralCode,
                referred_by: referrerId ?? undefined,
              },
            });

            await tx.creditBalance.create({
              data: {
                user_id: created.id,
                balance: 100,
                total_credited: 100,
              },
            });

            await tx.creditLedger.create({
              data: {
                user_id: created.id,
                type: "CREDIT_WELCOME",
                amount: 100,
                balance_after: 100,
                description: "Welcome bonus",
                idempotency_key: `gift:signup:${created.id}`,
              },
            });

            logger.info({ userId: created.id, email, provider: "google", referrerId }, "OAuth user registered");
            return created;
          });

          // Fire-and-forget: reward referrer
          if (referrerId) {
            creditReferralReward(referrerId, newUser.id).catch(() => {});
          }
        } catch (error) {
          logger.error({ error, email: user.email, provider: "google" }, "Google signIn callback failed");
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user, account }) {
      if (user && account?.provider === "google") {
        const dbUser = await db.user.findUnique({ where: { email: user.email! } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.skipCompliance = dbUser.skip_compliance;
          token._refreshedAt = Date.now();
        }
      } else if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.skipCompliance = (user as { skipCompliance?: boolean }).skipCompliance ?? false;
        token._refreshedAt = Date.now();
      } else if (token.id) {
        // Periodically refresh role & skipCompliance from DB (every 5 min)
        // so admin changes take effect without requiring re-login
        const lastRefresh = (token._refreshedAt as number) ?? 0;
        if (Date.now() - lastRefresh > 5 * 60 * 1000) {
          try {
            const fresh = await db.user.findUnique({
              where: { id: token.id as string },
              select: { role: true, skip_compliance: true, is_active: true },
            });
            if (fresh) {
              token.role = fresh.role;
              token.skipCompliance = fresh.skip_compliance;
              if (!fresh.is_active) return null as unknown as typeof token;
            }
          } catch { /* DB unavailable — keep existing token values */ }
          token._refreshedAt = Date.now();
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as { role: string }).role = token.role as string;
        (session.user as unknown as { skipCompliance: boolean }).skipCompliance = (token.skipCompliance as boolean) ?? false;
      }
      return session;
    },
  },
});
