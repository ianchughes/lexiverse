
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card'; // Card sub-components are not directly used here
import { Gem, Zap, Star, Users2, Gift, LogIn, UserPlus, Info } from 'lucide-react';

interface LoggedOutLandingPageProps {
  inviteCodeFromUrl?: string | null;
}

export function LoggedOutLandingPage({ inviteCodeFromUrl }: LoggedOutLandingPageProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full py-10 md:py-16 px-4">
      <h1 className="text-4xl md:text-5xl font-headline text-primary mb-4 sm:mb-6">
        Welcome to LexiVerse—the thrilling daily word sprint with a killer twist!
      </h1>
      <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 sm:mb-10 leading-relaxed">
        Scramble mystery letters in just 90 seconds. Spot a fresh word no one's claimed? Mint it as YOURS! From then on, score points EVERY time anyone guesses it—build your word empire and watch rewards roll in, even when you're chilling offline!
        <br/><br/>
        Nail the Word of the Day for DOUBLE points. Team up in Circles to smash leaderboards with friends.
        <br/><br/>
        Ready to claim your words and dominate? Sign up FREE now—your empire awaits!
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto mb-10 sm:mb-12 text-left">
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Gem className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Mint & Own Words</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Claim unique words as your own. Earn points forever when others guess them. Build a word legacy that keeps paying off!</p>
          </div>
        </Card>
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Daily 90-Second Blitz</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">A fresh, thrilling letter puzzle drops every day at 00:00 GMT. Fast fingers, sharp mind—race to find words!</p>
          </div>
        </Card>
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Star className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Word of the Day Jackpot</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Hunt the secret 7-9 letter word. Find it? Your whole daily score DOUBLES—instant boost!</p>
          </div>
        </Card>
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Users2 className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Circle Up & Conquer</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Create or join Circles. Merge scores with friends for weekly wins, glory, and epic bragging rights!</p>
          </div>
        </Card>
      </div>

      <Button className="text-base font-semibold py-3 px-6 sm:px-8 sm:text-lg sm:py-4 sm:px-10 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200" asChild>
        <Link href={`/auth/register${inviteCodeFromUrl ? `?inviteCode=${inviteCodeFromUrl}` : ''}`}>
          <Gift className="mr-2 h-5 sm:h-6 w-5 sm:w-6" /> Sign Up FREE & Claim Your Empire!
        </Link>
      </Button>
      <p className="mt-4">
        <Button variant="link" asChild className="text-sm sm:text-base">
          <Link href={`/auth/login${inviteCodeFromUrl ? `?inviteCode=${inviteCodeFromUrl}` : ''}`}>Already have an account? Log In</Link>
        </Button>
      </p>
      <p className="mt-6 text-xs sm:text-sm text-muted-foreground">
        All submitted words are validated. Own unique additions to the LexiVerse!
      </p>
    </div>
  );
}
