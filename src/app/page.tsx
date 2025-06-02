
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
import type { SeedingLetter, SubmittedWord, GameState, WordSubmission } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlayCircle, Check, AlertTriangle, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { firestore, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';


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
  const [hasPlayedToday, setHasPlayedToday] = useState(false);
  const [wordInvalidFlash, setWordInvalidFlash] = useState(false);
  const [shareableGameDate, setShareableGameDate] = useState('');
  const [isSubmittingForReview, setIsSubmittingForReview] = useState(false);
  const [currentPuzzleDate, setCurrentPuzzleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));


  const { toast } = useToast();

  useEffect(() => {
    const initialLetters = MOCK_SEEDING_LETTERS_CHARS.map((char, index) => ({
      id: `letter-${index}-${char}`,
      char,
      index,
    }));
    setSeedingLetters(initialLetters);

    const lastPlayed = localStorage.getItem('lexiverse_last_played_date');
    const today = new Date().toDateString();
    if (lastPlayed === today) {
      setHasPlayedToday(true);
      setGameState('cooldown');
    }
    setCurrentPuzzleDate(format(new Date(), 'yyyy-MM-dd')); // Set puzzle date for today
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
    setCurrentPuzzleDate(format(new Date(), 'yyyy-MM-dd')); // Ensure puzzle date is current
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
    setTimeout(() => setWordInvalidFlash(false), 300);
  };

  const handleSubmitWord = () => {
    if (gameState !== 'playing') return;

    const wordText = currentWord.map(l => l.char).join('').toUpperCase();
    if (wordText.length < MIN_WORD_LENGTH) {
      toast({ title: "Too Short", description: `Words must be at least ${MIN_WORD_LENGTH} letters long.`, variant: "destructive" });
      triggerInvalidWordFlash();
      return;
    }

    if (submittedWords.some(sw => sw.text.toUpperCase() === wordText)) {
      toast({ title: "Already Found", description: `You've already found "${wordText}".`, variant: "default" });
      triggerInvalidWordFlash();
      handleClearWord();
      return;
    }
    
    const isWotD = wordText === MOCK_WORD_OF_THE_DAY.toUpperCase();
    let points = 0;

    if (MOCK_APPROVED_WORDS.has(wordText) || isWotD) {
      points = wordText.length * 10;
      if (isWotD) {
        points *= 2;
        setGuessedWotD(true);
        toast({ title: "Word of the Day!", description: `You found "${wordText}"!`, className: "bg-accent text-accent-foreground" });
      } else {
         toast({ title: "Word Found!", description: `"${wordText}" is worth ${points} points.`, variant: "default" });
      }

      setSessionScore((prev) => prev + points);
      setSubmittedWords((prev) => [...prev, { id: crypto.randomUUID(), text: wordText, points, isWotD }]);
      handleClearWord();
    } else {
      setWordToReview(wordText);
      setShowSubmitForReviewDialog(true);
    }
  };

  // Simulates fetching word data from WordsAPI and submitting to Firestore
  const fetchWordDataAndSubmit = async (wordToSubmit: string) => {
    setIsSubmittingForReview(true);
    toast({ title: "Checking Word...", description: `Verifying "${wordToSubmit}"...` });

    // ** SIMULATED WordsAPI CALL **
    // In a real app, this would be a call to a Cloud Function which then calls WordsAPI.
    // const apiKey = process.env.NEXT_PUBLIC_WORDSAPI_KEY;
    // if (!apiKey || apiKey === "YOUR_WORDSAPI_KEY") {
    //   toast({ title: "API Key Error", description: "WordsAPI key is not configured. Cannot submit word.", variant: "destructive" });
    //   setIsSubmittingForReview(false);
    //   return;
    // }
    // try {
    //   const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${wordToSubmit.toLowerCase()}`, {
    //     method: 'GET',
    //     headers: {
    //       'X-RapidAPI-Key': apiKey,
    //       'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
    //     }
    //   });
    //   if (!response.ok) {
    //     if (response.status === 404) throw new Error("Word not found in WordsAPI.");
    //     throw new Error(`WordsAPI request failed with status ${response.status}`);
    //   }
    //   const data = await response.json();
    //   const definition = data.results?.[0]?.definition || "No definition found.";
    //   const frequency = data.frequencyDetails?.[0]?.zipf || (data.frequency ? parseFloat(data.frequency) : 0); // Attempt to get frequency
    //   
    //   // Proceed to submitToFirestore(wordToSubmit, definition, frequency);
    // } catch (error: any) {
    //    toast({ title: "Word Verification Failed", description: error.message || `Could not verify "${wordToSubmit}".`, variant: "destructive" });
    //    setIsSubmittingForReview(false);
    //    return;
    // }

    // ** MOCK IMPLEMENTATION **
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
    const mockApiSuccess = Math.random() > 0.2; // Simulate 80% success rate for API
    
    if (mockApiSuccess) {
      const mockDefinition = `A simulated definition for ${wordToSubmit}.`;
      const mockFrequency = parseFloat((Math.random() * 7).toFixed(2)); // Zipf scores are roughly 1-7

      if (!auth.currentUser) {
        toast({ title: "Authentication Error", description: "You must be logged in to submit words.", variant: "destructive" });
        setIsSubmittingForReview(false);
        return;
      }

      const newSubmission: WordSubmission = {
        wordText: wordToSubmit.toUpperCase(),
        definition: mockDefinition,
        frequency: mockFrequency,
        status: 'PendingModeratorReview',
        submittedByUID: auth.currentUser.uid,
        submittedTimestamp: serverTimestamp(),
        puzzleDateGMT: currentPuzzleDate,
      };

      try {
        await addDoc(collection(firestore, "WordSubmissionsQueue"), newSubmission);
        toast({
          title: "Word Submitted!",
          description: `"${wordToSubmit}" (Definition: ${mockDefinition.substring(0,50)}...) has been sent for review.`,
          variant: "default"
        });
      } catch (error) {
        console.error("Error submitting word to Firestore:", error);
        toast({ title: "Submission Failed", description: "Could not save your word submission. Please try again.", variant: "destructive" });
      }
    } else {
      toast({
        title: "Word Not Recognized",
        description: `"${wordToSubmit}" could not be verified by our dictionary service or is not a recognized word.`,
        variant: "destructive"
      });
    }
    // ** END MOCK IMPLEMENTATION **
    
    setIsSubmittingForReview(false);
    handleClearWord();
  };


  const handleSubmitForReviewConfirm = async (submit: boolean) => {
    setShowSubmitForReviewDialog(false);
    if (submit && wordToReview) {
      await fetchWordDataAndSubmit(wordToReview);
    } else {
      toast({ title: "Not Submitted", description: `"${wordToReview}" was not submitted.`, variant: "default" });
      handleClearWord(); // Clear the word even if not submitted
    }
    setWordToReview("");
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
             <div className="w-1/3 text-left">
                <Badge variant="outline" className="text-sm">Score: {sessionScore}</Badge>
            </div>
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
            isSubmitting={isSubmittingForReview}
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
          setShareableGameDate(currentPuzzleDate);
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
          date: shareableGameDate,
        }}
      />

      <AlertDialog open={showSubmitForReviewDialog} onOpenChange={setShowSubmitForReviewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Word for Review?</AlertDialogTitle>
            <AlertDialogDescription>
              The word "{wordToReview.toUpperCase()}" is not in our current dictionary.
              Would you like to check its validity and submit it for review?
              If approved, you might "own" this word!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleSubmitForReviewConfirm(false)} disabled={isSubmittingForReview}>
              No, Thanks
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleSubmitForReviewConfirm(true)} 
              disabled={isSubmittingForReview}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmittingForReview ? 'Submitting...' : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Yes, Check & Submit
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
       <p className="text-xs text-muted-foreground text-center mt-8">
            Note: Word verification (WordsAPI) is currently SIMULATED.
            A backend function is recommended for real API calls.
            Please configure NEXT_PUBLIC_WORDSAPI_KEY in your .env file if you plan to implement the direct client-side call (not recommended for production).
        </p>
    </div>
  );
}
