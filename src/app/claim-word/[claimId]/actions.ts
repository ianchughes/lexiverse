'use server';

import { firestore } from '@/lib/firebase';
import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { WordGift, MasterWordType } from '@/types';

export async function claimGiftedWordServerAction(claimId: string, userId: string): Promise<{ success: boolean; error?: string; wordText?: string }> {
  const giftRef = doc(firestore, 'WordGifts', claimId);
  try {
    return await runTransaction(firestore, async (transaction) => {
      const giftSnap = await transaction.get(giftRef);
      if (!giftSnap.exists()) {
        throw new Error('This gift link is invalid or has expired.');
      }

      const giftData = giftSnap.data() as WordGift;

      if (giftData.recipientUserId !== userId) {
        throw new Error('This gift is not intended for you. Please log in with the correct account.');
      }
      if (giftData.status !== 'PendingClaim') {
        throw new Error(`This gift has already been ${giftData.status.toLowerCase()}.`);
      }
      if (giftData.expiresAt.toMillis() < Date.now()) {
        transaction.update(giftRef, { status: 'Expired' });
        throw new Error('This gift has expired.');
      }

      const wordRef = doc(firestore, 'Words', giftData.wordText);
      const wordSnap = await transaction.get(wordRef);
      if (!wordSnap.exists() || (wordSnap.data() as MasterWordType)?.originalSubmitterUID) {
        transaction.update(giftRef, { status: 'Expired', adminNotes: 'Word became unavailable.' });
        throw new Error('Sorry, this word is no longer available to be claimed.');
      }

      transaction.update(wordRef, { originalSubmitterUID: userId });
      transaction.update(giftRef, { status: 'Claimed', claimedAt: serverTimestamp() as Timestamp });

      return { success: true, wordText: giftData.wordText };
    });
  } catch (error: any) {
    console.error('Error claiming gifted word:', error);
    return { success: false, error: error.message };
  }
}

