
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
        LexiVerse: Mint Words. Own the Game. Earn Forever! 🚀
      </h1>
      <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 sm:mb-10 leading-relaxed">
        Welcome to LexiVerse, the daily 90-second word dash with a revolutionary twist! Find words from 9 mystery letters. Be the FIRST to discover a new word (not yet in our game), get it approved, and you "MINT" it as your own! From that moment on, every time any other player, on any day, guesses your minted word, YOU earn the points too – build your word empire and watch your score grow even when you're not playing! Plus, nail the Word of the Day to double your daily score and team up in Circles to dominate the leaderboards!
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto mb-10 sm:mb-12 text-left">
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Gem className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Mint & Own Words</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Your unique word discoveries become yours! Get them approved and earn ongoing points automatically when others find them. This is your word legacy!</p>
          </div>
        </Card>
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Daily 90-Second Blitz</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">A fresh, thrilling 9-letter puzzle drops every day at 00:00 GMT. Fast fingers, sharp mind!</p>
          </div>
        </Card>
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Star className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Word of the Day Jackpot</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Find the special 6-9 letter word and your entire daily score gets DOUBLED!</p>
          </div>
        </Card>
        <Card className="bg-card/70 p-3 sm:p-4 md:p-5 rounded-lg shadow-md flex items-start space-x-2 sm:space-x-3 md:space-x-4">
          <Users2 className="h-6 w-6 sm:h-8 sm:w-8 text-accent mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-md sm:text-lg text-card-foreground">Circle Up & Conquer</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Create or join Circles. Your scores and your friends' scores combine for weekly glory and bragging rights!</p>
          </div>
        </Card>
      </div>

      <Button className="text-base font-semibold py-3 px-6 sm:px-8 sm:text-lg sm:py-4 sm:px-10 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200" asChild>
        <Link href={`/auth/register${inviteCodeFromUrl ? `?inviteCode=${inviteCodeFromUrl}` : ''}`}>
          <Gift className="mr-2 h-5 sm:h-6 w-5 sm:w-6" /> Sign Up Free & Start Minting Your Word Empire!
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
