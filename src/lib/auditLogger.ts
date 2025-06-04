
'use server';

import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { AdminActionType, AdminAuditLogEntry } from '@/types';

const ADMIN_AUDIT_LOGS_COLLECTION = "AdminAuditLogs";

interface LogAdminActionPayload {
  actingAdminId: string;
  actionType: AdminActionType;
  targetEntityType?: string;
  targetEntityId?: string;
  targetEntityDisplay?: string; // For easier display in logs, e.g., username, wordText
  details?: string | object; // Can be a simple string summary or a more complex object
}

export async function logAdminAction(payload: LogAdminActionPayload): Promise<void> {
  try {
    const auditLogEntry: Omit<AdminAuditLogEntry, 'id'> = {
      timestamp: serverTimestamp() as Timestamp,
      actingAdminId: payload.actingAdminId,
      actionType: payload.actionType,
      targetEntityType: payload.targetEntityType,
      targetEntityId: payload.targetEntityId,
      targetEntityDisplay: payload.targetEntityDisplay,
      details: payload.details || `Action: ${payload.actionType} performed by ${payload.actingAdminId}`,
    };
    await addDoc(collection(firestore, ADMIN_AUDIT_LOGS_COLLECTION), auditLogEntry);
  } catch (error) {
    console.error("Failed to write admin audit log:", error, "Payload:", payload);
    // Decide if this error should be propagated or just logged. For now, just log.
  }
}
