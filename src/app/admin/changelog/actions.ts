
'use server';

import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import type { ChangelogEntry } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';

interface AdminCreateChangelogEntryPayload {
  version: string;
  title: string;
  description: string;
  actingAdminId: string;
}

export async function adminCreateChangelogEntryAction(payload: AdminCreateChangelogEntryPayload): Promise<{ success: boolean; error?: string; entryId?: string }> {
  const { version, title, description, actingAdminId } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Admin authentication required." };
  }
  if (!version.trim() || !title.trim() || !description.trim()) {
    return { success: false, error: "Version, title, and description are required." };
  }

  try {
    const newEntryRef = await addDoc(collection(firestore, 'ChangelogEntries'), {
      version,
      title,
      description,
      datePublished: serverTimestamp(),
      publishedByAdminId: actingAdminId,
    });

    await logAdminAction({
      actingAdminId,
      actionType: 'CHANGELOG_ENTRY_CREATE',
      targetEntityType: 'ChangelogEntry',
      targetEntityId: newEntryRef.id,
      targetEntityDisplay: `Version ${version}`,
      details: `Created changelog entry: "${title}"`,
    });

    return { success: true, entryId: newEntryRef.id };
  } catch (error: any) {
    console.error("Error creating changelog entry:", error);
    return { success: false, error: error.message || "Failed to create changelog entry." };
  }
}

interface AdminDeleteChangelogEntryPayload {
  entryId: string;
  actingAdminId: string;
  entryVersion: string; // For logging
}

export async function adminDeleteChangelogEntryAction(payload: AdminDeleteChangelogEntryPayload): Promise<{ success: boolean; error?: string }> {
  const { entryId, actingAdminId, entryVersion } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Admin authentication required." };
  }
  if (!entryId) {
    return { success: false, error: "Changelog entry ID is required." };
  }

  try {
    const entryDocRef = doc(firestore, 'ChangelogEntries', entryId);
    await deleteDoc(entryDocRef);

    await logAdminAction({
      actingAdminId,
      actionType: 'CHANGELOG_ENTRY_DELETE',
      targetEntityType: 'ChangelogEntry',
      targetEntityId: entryId,
      targetEntityDisplay: `Version ${entryVersion}`,
      details: `Deleted changelog entry for version ${entryVersion}.`,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting changelog entry:", error);
    return { success: false, error: error.message || "Failed to delete changelog entry." };
  }
}
