'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Award, CheckCircle2, XCircle, Share2 } from 'lucide-react';

interface DailyDebriefDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  score: number;
  wordsFoundCount: number;
  guessedWotD: boolean;
  onShare: () => void;
}

export function DailyDebriefDialog({
  isOpen,
  onOpenChange,
  score,
  wordsFoundCount,
  guessedWotD,
  onShare,
}: DailyDebriefDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline text-center text-primary">Daily Debrief</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Here's how you did today!
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-3 bg-background rounded-md">
            <div className="flex items-center space-x-2">
              <Award className="h-6 w-6 text-primary" />
              <span className="text-lg font-medium">Final Score</span>
            </div>
            <span className="text-xl font-bold text-primary">{score}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-background rounded-md">
            <span className="text-lg font-medium">Words Found</span>
            <span className="text-xl font-bold">{wordsFoundCount}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-background rounded-md">
            <span className="text-lg font-medium">Word of the Day</span>
            {guessedWotD ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <XCircle className="h-8 w-8 text-destructive" />
            )}
          </div>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={onShare} className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
            <Share2 className="mr-2 h-4 w-4" />
            Share Your Results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
