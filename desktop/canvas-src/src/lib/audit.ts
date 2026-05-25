import { db } from "./db";
import { logger } from "./logger";
import type { AuditAction } from "@/generated/prisma/client";

interface AuditLogEntry {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  snapshotBefore?: Record<string, unknown> | null;
  snapshotAfter?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actor_id: entry.actorId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        snapshot_before: (entry.snapshotBefore ?? undefined) as any,
        snapshot_after: (entry.snapshotAfter ?? undefined) as any,
        metadata: (entry.metadata ?? undefined) as any,
        ip_address: entry.ipAddress ?? null,
      },
    });
  } catch (error) {
    logger.error({ error, entry }, "Failed to write audit log");
  }
}

export async function writeAuditLogSync(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  entry: AuditLogEntry
): Promise<void> {
  await (tx as any).auditLog.create({
    data: {
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      snapshot_before: (entry.snapshotBefore ?? undefined) as any,
      snapshot_after: (entry.snapshotAfter ?? undefined) as any,
      metadata: (entry.metadata ?? undefined) as any,
      ip_address: entry.ipAddress ?? null,
    },
  });
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return null;
}
