
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { LetterGrid } from '@/components/game/LetterGrid';
import { CurrentWordDisplay } from '@/components/game/CurrentWordDisplay';
import { WordEntryControls } from '@/components/game/WordEntryControls';
import { GameTimer } from '@/components/game/GameTimer';
import { SubmittedWordsList } from '@/components/game/SubmittedWordsList';
import { DailyDebriefDialog } from '@/components/game/DailyDebriefDialog';
import { ShareMomentDialog } from '@/components/game/ShareMomentDialog';
import type { SeedingLetter, SubmittedWord, GameState } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlayCircle, Check, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';


const DAILY_GAME_DURATION = 90; // 90 seconds
const MIN_WORD_LENGTH = 4;

// Mock data - In a real app, this would come from a backend
const MOCK_SEEDING_LETTERS_CHARS: string[] = ['L', 'E', 'X', 'I', 'V', 'R', 'S', 'E', 'O']; // Example for LEXIVERSE
const MOCK_WORD_OF_THE_DAY = "LEXIVERSE";
const MOCK_APPROVED_WORDS = new Set(["LEXI", "VERSE", "ROVE", "LIVE", "SIRE", "EROS", "RISE", MOCK_WORD_OF_THE_DAY]);

export default function HomePage() {
  const [seedingLetters, setSeedingLetters] = useState<SeedingLetter[]>([]);
  const [currentWord, setCurrentWord] = useState<SeedingLetter[]>([]);
  const [submittedWords, setSubmittedWords] = useState<SubmittedWord[]>([]);
  const [timeLeft, setTimeLeft] = useState(DAILY_GAME_DURATION);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [sessionScore, setSessionScore] = useState(0);
  const [finalDailyScore, setFinalDailyScore] = useState(0);
  const [guessedWotD, setGuessedWotD] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSubmitForReviewDialog, setShowSubmitForReviewDialog] = useState(false);
  const [wordToReview, setWordToReview] = useState("");
  const [hasPlayedToday, setHasPlayedToday] = useState(false); // Mocked: In real app, check User.LastPlayedDate_GMT
  const [wordInvalidFlash, setWordInvalidFlash] = useState(false);
  const [shareableGameDate, setShareableGameDate] = useState('');


  const { toast } = useToast();

  useEffect(() => {
    // Initialize seeding letters with unique IDs
    const initialLetters = MOCK_SEEDING_LETTERS_CHARS.map((char, index) => ({
      id: `letter-${index}-${char}`, // Ensure unique ID even for duplicate chars
      char,
      index,
    }));
    setSeedingLetters(initialLetters);

    // Mock checking if user has played today
    const lastPlayed = localStorage.getItem('lexiverse_last_played_date');
    const today = new Date().toDateString();
    if (lastPlayed === today) {
      setHasPlayedToday(true);
      setGameState('cooldown');
    }
  }, []);

  useEffect(() => {
    if (gameState !== 'playing' || timeLeft === 0) return;

    const timerId = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timerId);
          handleGameEnd();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [gameState, timeLeft]);


  const startGame = () => {
    if (hasPlayedToday) {
      toast({ title: "Already Played", description: "You've already played today. Come back tomorrow!", variant: "default" });
      return;
    }
    setCurrentWord([]);
    setSubmittedWords([]);
    setSessionScore(0);
    setGuessedWotD(false);
    setTimeLeft(DAILY_GAME_DURATION);
    setGameState('playing');
  };

  const handleGameEnd = () => {
    setGameState('debrief');
    let finalScore = sessionScore;
    if (guessedWotD) {
      finalScore *= 2;
    }
    setFinalDailyScore(finalScore);
    setShowDebrief(true);
    setHasPlayedToday(true);
    localStorage.setItem('lexiverse_last_played_date', new Date().toDateString());
  };

  const handleLetterClick = useCallback((letter: SeedingLetter) => {
    if (gameState !== 'playing') return;
    // Check if this specific instance of the letter is already used for the current word
    if (!currentWord.find(l => l.id === letter.id)) {
       setCurrentWord((prev) => [...prev, letter]);
    }
  }, [gameState, currentWord]);

  const handleBackspace = () => {
    if (gameState !== 'playing') return;
    setCurrentWord((prev) => prev.slice(0, -1));
  };

  const handleClearWord = () => {
    if (gameState !== 'playing') return;
    setCurrentWord([]);
  };
  
  const triggerInvalidWordFlash = () => {
    setWordInvalidFlash(true);
    setTimeout(() => setWordInvalidFlash(false), 300); // Animation duration
  };

  const handleSubmitWord = () => {
    if (gameState !== 'playing') return;

    const wordText = currentWord.map(l => l.char).join('');
    if (wordText.length < MIN_WORD_LENGTH) {
      toast({ title: "Too Short", description: `Words must be at least ${MIN_WORD_LENGTH} letters long.`, variant: "destructive" });
      triggerInvalidWordFlash();
      return;
    }

    // Check if word has already been submitted in this session
    if (submittedWords.some(sw => sw.text === wordText)) {
      toast({ title: "Already Found", description: `You've already found "${wordText}".`, variant: "default" });
      triggerInvalidWordFlash();
      handleClearWord();
      return;
    }
    
    // Basic check if letters are from seeding letters (already handled by UI construction)

    const isWotD = wordText.toUpperCase() === MOCK_WORD_OF_THE_DAY.toUpperCase();
    let points = 0; // Mock scoring

    if (MOCK_APPROVED_WORDS.has(wordText.toUpperCase()) || isWotD) {
      points = wordText.length * 10; // Simple scoring: length * 10
      if (isWotD) {
        points *= 2; // WotD base points doubled
        setGuessedWotD(true);
        toast({ title: "Word of the Day!", description: `You found "${wordText}"!`, className: "bg-accent text-accent-foreground" });
      } else {
         toast({ title: "Word Found!", description: `"${wordText}" is worth ${points} points.`, variant: "default" });
      }

      setSessionScore((prev) => prev + points);
      setSubmittedWords((prev) => [...prev, { id: crypto.randomUUID(), text: wordText, points, isWotD }]);
      handleClearWord();
    } else {
      // Not in approved dictionary
      setWordToReview(wordText);
      setShowSubmitForReviewDialog(true);
      // Note: word is not cleared here, user might not want to submit
    }
  };

  const handleSubmitForReviewConfirm = (submit: boolean) => {
    setShowSubmitForReviewDialog(false);
    if (submit) {
      toast({ title: "Submitted for Review", description: `"${wordToReview}" has been sent for moderation.`, variant: "default" });
      // In a real app, send to backend queue.
      // For now, we just acknowledge and clear.
    } else {
      toast({ title: "Not Submitted", description: `"${wordToReview}" was not submitted for review.`, variant: "default" });
    }
    setWordToReview("");
    handleClearWord();
  };


  const currentWordText = currentWord.map(l => l.char).join('');
  const selectedLetterIndices = currentWord.map(l => l.index);

  if (gameState === 'cooldown') {
    return (
      <div className="flex flex-col items-center justify-center text-center h-full py-12">
        <AlertTriangle className="w-16 h-16 text-primary mb-4" />
        <h1 className="text-3xl font-headline mb-4">Patience, Word Smith!</h1>
        <p className="text-xl text-muted-foreground mb-8">
          You've already played today's Lexiverse puzzle.
        </p>
        <p className="text-lg">A new challenge awaits tomorrow at 00:00 GMT.</p>
      </div>
    );
  }


  return (
    <div className="flex flex-col items-center justify-center p-2 md:p-4">
      {gameState === 'idle' && (
        <div className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-headline text-primary">Welcome to Lexiverse!</h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
            Find as many 4+ letter words as you can in 90 seconds using the 9 seeding letters.
            Discover the special "Word of the Day" for a massive bonus!
          </p>
          <Button size="lg" onClick={startGame} className="font-semibold text-lg py-3 px-8">
            <PlayCircle className="mr-2 h-6 w-6" /> Start Today's Game
          </Button>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="w-full max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="w-1/3"> {/* Placeholder for potential left element */} </div>
            <GameTimer timeLeft={timeLeft} />
            <div className="w-1/3 flex justify-end">
              {guessedWotD && (
                <Badge variant="default" className="bg-accent text-accent-foreground py-2 px-3 text-sm">
                  <Check className="h-5 w-5 mr-1" /> WotD Found!
                </Badge>
              )}
            </div>
          </div>
          
          <CurrentWordDisplay word={currentWordText} isInvalid={wordInvalidFlash} />
          <LetterGrid
            letters={seedingLetters}
            onLetterClick={handleLetterClick}
            selectedIndices={selectedLetterIndices}
            disabled={gameState !== 'playing'}
          />
          <WordEntryControls
            onSubmit={handleSubmitWord}
            onClear={handleClearWord}
            onBackspace={handleBackspace}
            canSubmit={currentWord.length >= MIN_WORD_LENGTH}
            canClearOrBackspace={currentWord.length > 0}
            isSubmitting={false} // For now, submission is instant client-side
          />
          <h2 className="text-xl font-semibold mb-2 text-center">Words Found: {submittedWords.length}</h2>
          <SubmittedWordsList words={submittedWords} />
        </div>
      )}

      <DailyDebriefDialog
        isOpen={showDebrief}
        onOpenChange={setShowDebrief}
        score={finalDailyScore}
        wordsFoundCount={submittedWords.length}
        guessedWotD={guessedWotD}
        onShare={() => {
          setShowDebrief(false);
          setShareableGameDate(new Date().toLocaleDateString('en-CA'));
          setShowShareModal(true);
        }}
      />
      
      <ShareMomentDialog
        isOpen={showShareModal}
        onOpenChange={setShowShareModal}
        gameData={{
          score: finalDailyScore,
          guessedWotD,
          wordsFoundCount: submittedWords.length,
          date: shareableGameDate, // YYYY-MM-DD
          // circleName: "My Awesome Circle" // Optional
        }}
      />

      <AlertDialog open={showSubmitForReviewDialog} onOpenChange={setShowSubmitForReviewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Word for Review?</AlertDialogTitle>
            <AlertDialogDescription>
              The word "{wordToReview.toUpperCase()}" is not in our current dictionary. Would you like to submit it for review? If approved, you might "own" this word!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleSubmitForReviewConfirm(false)}>No, Thanks</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmitForReviewConfirm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Yes, Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
