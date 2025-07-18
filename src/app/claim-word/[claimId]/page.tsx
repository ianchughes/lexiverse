
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, PartyPopper, Gift, XCircle, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { claimGiftedWordServerAction, verifyGiftedWordServerAction } from './actions';

function ClaimWordContent() {
  const params = useParams();
  const claimId = typeof params.claimId === 'string' ? params.claimId : '';
  const { currentUser, isLoadingAuth } = useAuth();
  
  const [status, setStatus] = useState<'loading' | 'confirm' | 'claiming' | 'success' | 'error' | 'unauthenticated'>('loading');
  const [message, setMessage] = useState('Checking your gift...');

  const verifyGift = useCallback(async () => {
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

    const result = await verifyGiftedWordServerAction(claimId, currentUser.uid);
    if (result.success) {
      setStatus('confirm');
      setMessage('You have been gifted a word! Confirm below to claim it and reveal what it is.');
    } else {
      setStatus('error');
      setMessage(result.error || 'An unknown error occurred while verifying your gift.');
    }
  }, [claimId, currentUser, isLoadingAuth]);

  const processClaim = useCallback(async () => {
    if (!currentUser) return;
    setStatus('claiming');
    setMessage('Claiming your gift...');
    const result = await claimGiftedWordServerAction(claimId, currentUser.uid);

    if (result.success) {
      setStatus('success');
      setMessage(`Congratulations, you now own "${result.wordText}"! From now on, every time someone guesses that word, you will get points.`);
    } else {
      setStatus('error');
      setMessage(result.error || 'An unknown error occurred while claiming your gift.');
    }
  }, [claimId, currentUser]);

  useEffect(() => {
    verifyGift();
  }, [verifyGift]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4">
      <Card className="w-full max-w-lg shadow-2xl text-center">
        <CardHeader>
          {(status === 'loading' || status === 'claiming') && <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />}
          {status === 'confirm' && <Gift className="mx-auto h-12 w-12 text-primary" />}
          {status === 'success' && <PartyPopper className="mx-auto h-12 w-12 text-green-500" />}
          {status === 'error' && <XCircle className="mx-auto h-12 w-12 text-destructive" />}
          {status === 'unauthenticated' && <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />}
          
          <CardTitle className="text-2xl mt-4">
            {status === 'loading' && 'Checking Your Gift...'}
            {status === 'claiming' && 'Claiming Your Gift...'}
            {status === 'confirm' && 'Confirm Claim'}
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

          {status === 'confirm' && (
            <div className="pt-6">
              <Button onClick={processClaim}><Gift className="mr-2 h-4 w-4"/>Claim Word</Button>
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
