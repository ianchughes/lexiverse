
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, updateDoc, writeBatch, serverTimestamp, Timestamp, runTransaction } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, PartyPopper, Gift, XCircle, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import type { WordGift, MasterWordType } from '@/types';

// Server action to claim the word
async function claimGiftedWordAction(claimId: string, userId: string): Promise<{ success: boolean; error?: string; wordText?: string }> {
  const giftRef = doc(firestore, 'WordGifts', claimId);
  try {
    return await runTransaction(firestore, async (transaction) => {
      const giftSnap = await transaction.get(giftRef);
      if (!giftSnap.exists()) {
        throw new Error("This gift link is invalid or has expired.");
      }

      const giftData = giftSnap.data() as WordGift;

      if (giftData.recipientUserId !== userId) {
        throw new Error("This gift is not intended for you. Please log in with the correct account.");
      }
      if (giftData.status !== 'PendingClaim') {
        throw new Error(`This gift has already been ${giftData.status.toLowerCase()}.`);
      }
      if (giftData.expiresAt.toMillis() < Date.now()) {
        transaction.update(giftRef, { status: 'Expired' });
        throw new Error("This gift has expired.");
      }

      const wordRef = doc(firestore, 'Words', giftData.wordText);
      const wordSnap = await transaction.get(wordRef);
      if (!wordSnap.exists() || wordSnap.data()?.originalSubmitterUID) {
        transaction.update(giftRef, { status: 'Expired', adminNotes: 'Word became unavailable.' });
        throw new Error("Sorry, this word is no longer available to be claimed.");
      }

      // All checks passed, perform the claim
      transaction.update(wordRef, { originalSubmitterUID: userId });
      transaction.update(giftRef, { status: 'Claimed', claimedAt: serverTimestamp() as Timestamp });

      return { success: true, wordText: giftData.wordText };
    });
  } catch (error: any) {
    console.error("Error claiming gifted word:", error);
    return { success: false, error: error.message };
  }
}

function ClaimWordContent() {
  const params = useParams();
  const router = useRouter();
  const claimId = typeof params.claimId === 'string' ? params.claimId : '';
  const { currentUser, isLoadingAuth } = useAuth();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'unauthenticated'>('loading');
  const [message, setMessage] = useState('Verifying your gift...');

  const processClaim = useCallback(async () => {
    if (isLoadingAuth) return;

    if (!currentUser) {
      setStatus('unauthenticated');
      setMessage('You need to be logged in to claim your gift.');
      return;
    }

    if (!claimId) {
      setStatus('error');
      setMessage('No claim ID provided.');
      return;
    }

    const result = await claimGiftedWordAction(claimId, currentUser.uid);

    if (result.success) {
      setStatus('success');
      setMessage(`Congratulations, you now own "${result.wordText}"! From now on, every time someone guesses that word, you will get points.`);
    } else {
      setStatus('error');
      setMessage(result.error || 'An unknown error occurred while claiming your gift.');
    }
  }, [claimId, currentUser, isLoadingAuth]);

  useEffect(() => {
    processClaim();
  }, [processClaim]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4">
      <Card className="w-full max-w-lg shadow-2xl text-center">
        <CardHeader>
          {status === 'loading' && <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />}
          {status === 'success' && <PartyPopper className="mx-auto h-12 w-12 text-green-500" />}
          {status === 'error' && <XCircle className="mx-auto h-12 w-12 text-destructive" />}
          {status === 'unauthenticated' && <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />}
          
          <CardTitle className="text-2xl mt-4">
            {status === 'loading' && 'Claiming Your Gift...'}
            {status === 'success' && 'Word Claimed!'}
            {status === 'error' && 'Claim Failed'}
            {status === 'unauthenticated' && 'Please Log In'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{message}</p>
          
          {status === 'unauthenticated' && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button asChild>
                <Link href={`/auth/login?redirect=/claim-word/${claimId}`}><LogIn className="mr-2 h-4 w-4"/>Log In</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href={`/auth/register?redirect=/claim-word/${claimId}`}><UserPlus className="mr-2 h-4 w-4"/>Sign Up</Link>
              </Button>
            </div>
          )}

          {(status === 'success' || status === 'error') && (
            <div className="pt-6">
              <Button asChild>
                <Link href="/"><Gift className="mr-2 h-4 w-4"/>Back to the Game</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClaimWordPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
            <ClaimWordContent />
        </Suspense>
    );
}
