
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Rocket, Timer, Info } from 'lucide-react';

interface WelcomeInstructionsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}

export function WelcomeInstructionsDialog({ isOpen, onOpenChange, onConfirm }: WelcomeInstructionsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl bg-card text-card-foreground">
        <DialogHeader className="text-center">
          <Rocket className="mx-auto h-12 w-12 text-primary mb-3" />
          <DialogTitle className="text-3xl font-headline text-primary">Welcome to Lexiverse!</DialogTitle>
          <DialogDescription className="text-md text-muted-foreground px-2">
            Get ready for a fun, fast-paced daily word challenge! Here’s how to jump in:
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] md:max-h-[60vh] px-4 py-2 my-4 border rounded-md bg-background">
          <div className="space-y-4 text-sm text-foreground/90">
            <div>
              <h3 className="font-semibold text-lg text-primary mb-1">Your Daily Puzzle:</h3>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>Each day at 00:00 GMT, a new puzzle with 9 unique seeding letters awaits you.</li>
                <li>When you're ready and press "Play," a <strong className="text-accent">90-SECOND TIMER</strong> starts immediately and won't stop!</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg text-primary mb-1">How to Play (In 90 Seconds!):</h3>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>Once the timer starts, quickly tap the letters on your screen to spell words.</li>
                <li>Words must be <strong className="text-accent">4 letters or longer</strong>.</li>
                <li>You can only use the 9 letters provided for that day. If a letter appears twice in the seeding letters (e.g., two 'P's), you can use it twice in one word (like in "APPLE"). Otherwise, each letter you see in the grid can only be used once per word you make.</li>
                <li>Hit the "Enter" / Submit button for each word you find.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg text-primary mb-1">Scoring Points:</h3>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>You'll earn points for every correct English word.</li>
                <li>Longer and less common words generally score more points!</li>
                <li><strong className="text-accent">Word of the Day (WotD):</strong> There's one special hidden word (6-9 letters long) each day. Find it, and your entire score for that day will be DOUBLED!</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg text-primary mb-1">Join the Fun with Circles:</h3>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>After your game, you can create or join "Circles" to team up with friends, combine your scores, and compete in weekly challenges!</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg text-primary mb-1">One Shot Per Day:</h3>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>You get one 90-second session to play the daily puzzle. Make it count!</li>
                <li>A brand new puzzle will be ready for you tomorrow.</li>
              </ul>
            </div>
            
            <div className="pt-2">
              <h3 className="font-semibold text-lg text-primary mb-1">Quick Tips:</h3>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>Look for common prefixes and suffixes.</li>
                <li>Don't be afraid to try words – if a word isn't in our main list yet, you might be able to submit it for review and even "own" it if it's new to Lexiverse!</li>
              </ul>
            </div>
          </div>
        </ScrollArea>
        
        <p className="text-center font-semibold text-md mt-3">Ready to start your first 90-second challenge?</p>

        <DialogFooter className="mt-4 sm:justify-center">
          <Button 
            onClick={onConfirm} 
            size="lg" 
            className="w-full sm:w-auto font-semibold text-lg bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Timer className="mr-2 h-5 w-5" />
            Let's Play!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
