import { auth } from "./auth";
import { AuthError, ForbiddenError } from "./errors";
import type { UserRole } from "@/generated/prisma/client";

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  SUPPORT: 1,
  FINANCE: 2,
  OWNER: 3,
  ADMIN: 4,
};

export type SessionWithRole = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: UserRole;
  };
};

export async function requireAuth(): Promise<SessionWithRole> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError("AUTH_002", "Not authenticated");
  }
  return session as unknown as SessionWithRole;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionWithRole> {
  const session = await requireAuth();
  const userRole = session.user.role;
  if (!roles.includes(userRole)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
  }
  return session;
}

export async function requireMinRole(minRole: UserRole): Promise<SessionWithRole> {
  const session = await requireAuth();
  const userLevel = ROLE_HIERARCHY[session.user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 999;
  if (userLevel < requiredLevel) {
    throw new ForbiddenError(`Requires at least ${minRole} role`);
  }
  return session;
}

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 999);
}
