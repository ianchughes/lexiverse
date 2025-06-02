
'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Award, CheckCircle2, XCircle, Share2, Users } from 'lucide-react';
import type { UserProfile } from '@/types'; // Import UserProfile

interface DailyDebriefDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  score: number;
  wordsFoundCount: number;
  guessedWotD: boolean;
  onShare: () => void;
  userProfile: UserProfile | null; // Add userProfile
  circleId?: string; // Add circleId
  circleName?: string; // Add circleName
}

export function DailyDebriefDialog({
  isOpen,
  onOpenChange,
  score,
  wordsFoundCount,
  guessedWotD,
  onShare,
  userProfile,
  circleId,
  circleName,
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
          
          {/* Circle Contribution Display */}
          {userProfile && (
            <div className="mt-4 p-3 bg-secondary/50 rounded-md text-center">
              {circleId && circleName ? (
                <p className="text-sm text-secondary-foreground">
                  Your score of <span className="font-bold">{score}</span> has been added to <Link href={`/circles/${circleId}`} className="text-primary hover:underline font-semibold">{circleName}</Link>'s total today!
                </p>
              ) : (
                <>
                  <p className="text-sm text-secondary-foreground mb-2">
                    Join a Circle to combine your scores with friends and compete for weekly prizes!
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/circles">
                      <Users className="mr-2 h-4 w-4"/> Find or Create a Circle
                    </Link>
                  </Button>
                </>
              )}
            </div>
          )}

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
