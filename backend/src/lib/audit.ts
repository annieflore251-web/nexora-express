
import { prisma } from "./prisma.js";

interface AuditLogInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        details: input.details ?? null,
      },
    });
  } catch (error) {
    // Audit failures should be logged for investigation.
    console.error("Erreur lors de l'enregistrement de l'audit :", error);
  }
}
