
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { ChangelogEntry } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Loader2, History, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';

export default function PublicChangelogPage() {
  const [changelogEntries, setChangelogEntries] = useState<ChangelogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChangelogEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = query(collection(firestore, "ChangelogEntries"), orderBy("datePublished", "desc"));
      const querySnapshot = await getDocs(q);
      const entries: ChangelogEntry[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChangelogEntry));
      setChangelogEntries(entries);
    } catch (error) {
      console.error("Error fetching changelog entries:", error);
      // Potentially set an error state here to display to the user
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChangelogEntries();
  }, [fetchChangelogEntries]);

  const formatDateSafe = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return format(timestamp.toDate(), 'PP p');
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-primary flex items-center gap-2">
            <History className="h-8 w-8" /> Game Updates & Changelog
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Stay informed about the latest features, improvements, and fixes in LexiVerse.
          </p>
        </div>
        <Button onClick={fetchChangelogEntries} variant="outline" size="icon" disabled={isLoading} aria-label="Refresh Changelog">
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center text-center h-64">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <p className="text-xl text-muted-foreground">Loading latest updates...</p>
        </div>
      ) : changelogEntries.length === 0 ? (
        <Card className="text-center py-12 shadow-lg">
          <CardHeader>
            <History className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <CardTitle className="text-2xl">No Updates Posted Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-6">
              Check back soon for the latest news and changes to LexiVerse!
            </CardDescription>
            <Button asChild>
              <Link href="/">Back to Game</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-auto"> {/* Adjust height as needed or remove for full page scroll */}
          <div className="space-y-6">
            {changelogEntries.map(entry => (
              <Card key={entry.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader className="bg-card-foreground/5 dark:bg-card-foreground/10 p-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <CardTitle className="text-2xl text-primary font-headline">
                      Version {entry.version}: {entry.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 sm:mt-0 whitespace-nowrap">
                       {formatDateSafe(entry.datePublished)}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-5">
                  {/* Using whitespace-pre-line to respect newlines from textarea input */}
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 whitespace-pre-line">
                    {entry.description}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
