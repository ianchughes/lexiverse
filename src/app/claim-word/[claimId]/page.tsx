
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PartyPopper, Gift, XCircle } from 'lucide-react';
import Link from 'next/link';
import { claimGiftedWordServerAction, verifyGiftedWordServerAction, declineGiftedWordServerAction } from './actions';

function ClaimWordContent() {
  const params = useParams();
  const claimId = typeof params.claimId === 'string' ? params.claimId : '';

  const [status, setStatus] = useState<'loading' | 'confirm' | 'claiming' | 'declining' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Checking your gift...');

  const verifyGift = useCallback(async () => {
    if (!claimId) {
      setStatus('error');
      setMessage('No claim ID provided.');
      return;
    }

    const result = await verifyGiftedWordServerAction(claimId);
    if (result.success) {
      setStatus('confirm');
      setMessage('You have been gifted a word! Accept to add it to your account or decline to return it to the pool.');
    } else {
      setStatus('error');
      setMessage(result.error || 'An unknown error occurred while verifying your gift.');
    }
  }, [claimId]);

  const processClaim = useCallback(async () => {
    setStatus('claiming');
    setMessage('Claiming your gift...');
    const result = await claimGiftedWordServerAction(claimId);

    if (result.success) {
      setStatus('success');
      setMessage(`Congratulations, you now own "${result.wordText}"! From now on, every time someone guesses that word, you will get points.`);
    } else {
      setStatus('error');
      setMessage(result.error || 'An unknown error occurred while claiming your gift.');
    }
  }, [claimId]);

  const processDecline = useCallback(async () => {
    setStatus('declining');
    setMessage('Declining the gift...');
    const result = await declineGiftedWordServerAction(claimId);
    if (result.success) {
      setStatus('success');
      setMessage('The gifted word has been returned to the pool.');
    } else {
      setStatus('error');
      setMessage(result.error || 'An unknown error occurred while declining the gift.');
    }
  }, [claimId]);

  useEffect(() => {
    verifyGift();
  }, [verifyGift]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4">
      <Card className="w-full max-w-lg shadow-2xl text-center">
        <CardHeader>
          {(status === 'loading' || status === 'claiming' || status === 'declining') && <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />}
          {status === 'confirm' && <Gift className="mx-auto h-12 w-12 text-primary" />}
          {status === 'success' && <PartyPopper className="mx-auto h-12 w-12 text-green-500" />}
          {status === 'error' && <XCircle className="mx-auto h-12 w-12 text-destructive" />}
          
          <CardTitle className="text-2xl mt-4">
            {status === 'loading' && 'Checking Your Gift...'}
            {status === 'claiming' && 'Claiming Your Gift...'}
            {status === 'declining' && 'Declining Gift...'}
            {status === 'confirm' && 'Confirm Claim'}
            {status === 'success' && 'Word Claimed!'}
            {status === 'error' && 'Claim Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{message}</p>

          {status === 'confirm' && (
            <div className="pt-6 flex gap-4 justify-center">
              <Button onClick={processClaim}><Gift className="mr-2 h-4 w-4"/>Accept Gift</Button>
              <Button variant="secondary" onClick={processDecline}>Decline</Button>
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
