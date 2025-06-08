
'use client';

import { Loader2 } from 'lucide-react';

export default function Loading() {
  // You can add any UI inside Loading, including a Skeleton.
  return (
    <div className="flex flex-col items-center justify-center text-center h-full py-12 min-h-[calc(100vh-20rem)]">
      <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
      <h1 className="text-2xl font-headline text-muted-foreground">Loading LexiVerse...</h1>
      <p className="text-muted-foreground mt-2">Getting things ready for your word adventure!</p>
    </div>
  );
}
