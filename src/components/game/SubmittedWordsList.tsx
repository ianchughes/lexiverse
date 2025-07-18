
'use client';

import type { SubmittedWord } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Award, Trophy, Loader2 } from 'lucide-react'; // Added Trophy and Loader2

interface SubmittedWordsListProps {
  words: SubmittedWord[];
}

export function SubmittedWordsList({ words }: SubmittedWordsListProps) {
  if (words.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-2 sm:p-4">
        No words found yet. Start typing!
      </div>
    );
  }

  return (
    <ScrollArea className="h-48 md:h-60 w-full max-w-md mx-auto border rounded-lg p-2 bg-card shadow">
      <div className="space-y-2 p-2">
        {words.map((word) => (
          <div
            key={word.id}
            className="flex items-center justify-between p-3 bg-background rounded-md shadow-sm hover:bg-secondary/50 transition-colors"
          >
            <span className="font-medium text-lg">{word.text.toUpperCase()}</span>
            <div className="flex items-center space-x-2">
              {word.isWotD && (
                <Badge variant="default" className="bg-accent text-accent-foreground">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> WotD
                </Badge>
              )}
              {word.newlyOwned && ( // Display if word was newly owned
                <Badge variant="outline" className="border-green-500 text-green-600">
                  <Trophy className="h-4 w-4 mr-1" /> Claimed!
                </Badge>
              )}
              {word.isPending ? (
                <Badge variant="outline">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Award className="h-4 w-4 mr-1" /> {word.points} pts
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
