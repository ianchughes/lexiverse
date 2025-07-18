'use client';

import type { SeedingLetter, SubmittedWord, GameState } from '@/types';
import { Button } from '@/components/ui/button';
import { LetterGrid } from '@/components/game/LetterGrid';
import { CurrentWordDisplay } from '@/components/game/CurrentWordDisplay';
import { WordEntryControls } from '@/components/game/WordEntryControls';
import { GameTimer } from '@/components/game/GameTimer';
import { SubmittedWordsList } from '@/components/game/SubmittedWordsList';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Check, Loader2, BellRing } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useDevice } from '@/contexts/DeviceContext';
import { motion, AnimatePresence } from 'framer-motion';


const DAILY_GAME_DURATION = 90; // This should ideally come from a shared config or props
const MIN_WORD_LENGTH = 4; // Same as above

interface GameScreenProps {
  gameState: GameState;
  sessionScore: number;
  timeLeft: number;
  currentWord: SeedingLetter[];
  currentWordText: string;
  wordInvalidFlash: boolean;
  seedingLetters: SeedingLetter[];
  onLetterClick: (letter: SeedingLetter) => void;
  selectedLetterIndices: number[];
  onSubmitWord: () => Promise<void>;
  onClearWord: () => void;
  onBackspace: () => void;
  isProcessingWord: boolean;
  submittedWords: SubmittedWord[];
  wotdFound: boolean;
  hasPlayedToday: boolean;
  onStartGame: () => void;
  isLoadingAuth: boolean; // To disable start button if auth is still loading
  isCurrentUser: boolean; // To disable start button if no user
  showWelcomeInstructionsModal: boolean; // To prevent starting game if modal is up
  showDebrief: boolean; // To prevent starting game if debrief is active
  pendingInvitesCount: number;
}

export function GameScreen({
  gameState,
  sessionScore,
  timeLeft,
  currentWord,
  currentWordText,
  wordInvalidFlash,
  seedingLetters,
  onLetterClick,
  selectedLetterIndices,
  onSubmitWord,
  onClearWord,
  onBackspace,
  isProcessingWord,
  submittedWords,
  wotdFound,
  hasPlayedToday,
  onStartGame,
  isLoadingAuth,
  isCurrentUser,
  showWelcomeInstructionsModal,
  showDebrief,
  pendingInvitesCount,
}: GameScreenProps) {
    const { isMobile } = useDevice();

  if (gameState === 'idle' && !showWelcomeInstructionsModal && !showDebrief) {
    return (
      <div className="text-center space-y-4 sm:space-y-6 w-full max-w-lg">
         {pendingInvitesCount > 0 && (
            <Alert className="mb-6 max-w-xl mx-auto text-left">
                <BellRing className="h-5 w-5" />
                <AlertTitle>You have Circle Invitations!</AlertTitle>
                <AlertDescription>
                  You have {pendingInvitesCount} pending circle invitation(s). Don't keep them waiting!
                  <Button asChild variant="link" className="p-0 ml-1 h-auto font-semibold">
                    <Link href="/notifications">View Your Invites</Link>
                  </Button>
                </AlertDescription>
            </Alert>
          )}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-headline text-primary">Welcome to LexiVerse!</h1>
        <p className="text-md sm:text-lg text-muted-foreground">
          Find as many {MIN_WORD_LENGTH}+ letter words as you can in {DAILY_GAME_DURATION} seconds.
          Points are awarded based on word rarity and length. WotD gets 2x final score bonus.
          Claimed words give their original submitter a bonus!
        </p>
        <Button 
          onClick={onStartGame} 
          className="font-semibold text-base py-2.5 px-6 sm:text-lg sm:py-3 sm:px-8" 
          disabled={isLoadingAuth || !isCurrentUser || hasPlayedToday || showWelcomeInstructionsModal || showDebrief}
        >
          <PlayCircle className="mr-2 h-5 sm:h-6 w-5 sm:w-6" /> Start Today's Game
        </Button>
      </div>
    );
  }

  if (isMobile && gameState === 'playing') {
    return (
      <div className="flex flex-col h-[calc(100svh-4rem-2rem)] w-full max-w-sm mx-auto">
        {/* Mobile-optimized header */}
        <div className="flex justify-between items-center p-2">
          <Badge variant="outline" className="text-lg font-bold px-3 py-1">
            Score: {sessionScore}
          </Badge>
          <GameTimer timeLeft={timeLeft} />
        </div>

        {/* Word Display Area */}
        <div className="py-2">
          <CurrentWordDisplay word={currentWordText} isInvalid={wordInvalidFlash} />
        </div>
        
        {/* Main content area, scrolls if needed */}
        <div className="flex-1 overflow-y-auto mb-2">
            <h2 className="text-lg font-semibold mb-2 text-center">Words Found: {submittedWords.length}</h2>
            <SubmittedWordsList words={submittedWords} />
        </div>

        {/* Letter Grid and Actions at the bottom */}
        <div className="flex-shrink-0">
          <LetterGrid
            letters={seedingLetters}
            onLetterClick={onLetterClick}
            selectedIndices={selectedLetterIndices}
            disabled={gameState !== 'playing'}
          />

          <div className="grid grid-cols-3 gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onBackspace}
              className="h-14 text-lg"
              disabled={isProcessingWord || currentWordText.length === 0}
            >
              ←
            </Button>
            <Button
              variant="default"
              onClick={onSubmitWord}
              disabled={isProcessingWord || currentWordText.length < MIN_WORD_LENGTH}
              className="h-14 text-lg font-bold"
            >
              {isProcessingWord ? <Loader2 className="h-6 w-6 animate-spin" /> : 'SUBMIT'}
            </Button>
            <Button
              variant="outline"
              onClick={onClearWord}
              className="h-14 text-lg"
              disabled={isProcessingWord || currentWordText.length === 0}
            >
              CLEAR
            </Button>
          </div>
        </div>
      </div>
    );
  }


  if (gameState === 'playing') { // Desktop layout
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4 w-full">
          <div className="sm:w-1/3 text-center sm:text-left order-2 sm:order-1 flex items-center justify-center sm:justify-start">
            <Badge variant="outline" className="text-base px-2 py-0.5 sm:text-lg sm:px-3 sm:py-1">Score: {sessionScore}</Badge>
          </div>
          <div className="sm:w-1/3 flex justify-center order-1 sm:order-2">
            <GameTimer timeLeft={timeLeft} />
          </div>
          <div className="sm:w-1/3 text-center sm:text-right min-h-[30px] sm:min-h-[38px] flex justify-center sm:justify-end items-center order-3 sm:order-3">
            {wotdFound && (
              <Badge variant="default" className="bg-accent text-accent-foreground text-xs py-1 px-2 sm:text-sm sm:py-2 sm:px-3">
                <Check className="h-4 w-4 sm:h-5 sm:w-5 mr-1" /> WotD Found!
              </Badge>
            )}
          </div>
        </div>
        
        <CurrentWordDisplay word={currentWordText} isInvalid={wordInvalidFlash} />
        <LetterGrid
          letters={seedingLetters}
          onLetterClick={onLetterClick}
          selectedIndices={selectedLetterIndices}
          disabled={gameState !== 'playing'}
        />
        <WordEntryControls
          onSubmit={onSubmitWord}
          onClear={onClearWord}
          onBackspace={onBackspace}
          canSubmit={currentWord.length >= MIN_WORD_LENGTH}
          canClearOrBackspace={currentWord.length > 0}
          isSubmitting={isProcessingWord}
        />
        <h2 className="text-xl font-semibold mb-2 text-center">Words Found: {submittedWords.length}</h2>
        <SubmittedWordsList words={submittedWords} />
      </div>
    );
  }

  // Fallback for other states if any (e.g., debrief is handled by dialog in page.tsx)
  return null;
}
