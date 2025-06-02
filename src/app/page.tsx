
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
import type { SeedingLetter, SubmittedWord, GameState, WordSubmission, SystemSettings } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlayCircle, Check, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { firestore, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';


const DAILY_GAME_DURATION = 90; // 90 seconds
const MIN_WORD_LENGTH = 4;

// --- Mock Data Update ---
interface MockWordDetails {
  frequency: number;
  originalSubmitterUID?: string;
  isWotD?: boolean;
}

const MOCK_WORD_OF_THE_DAY_TEXT = "LEXIVERSE";
const MOCK_SEEDING_LETTERS_CHARS: string[] = ['L', 'E', 'X', 'I', 'V', 'R', 'S', 'E', 'O'];

const MOCK_APPROVED_WORDS_MAP: Map<string, MockWordDetails> = new Map([
  ["LEXI", { frequency: 5.5 }],
  ["VERSE", { frequency: 4.2 }],
  ["ROVE", { frequency: 3.0, originalSubmitterUID: "claimerUID123" }], // Test claimed word
  ["LIVE", { frequency: 6.1, originalSubmitterUID: "anotherClaimerUID456" }],
  ["SIRE", { frequency: 2.5 }],
  ["EROS", { frequency: 1.8 }],
  ["RISE", { frequency: 5.0 }],
  [MOCK_WORD_OF_THE_DAY_TEXT, { frequency: 7.0, isWotD: true }],
  ["OXES", { frequency: 2.2 }],
  ["SOLE", { frequency: 3.5, originalSubmitterUID: "claimerUID123" }],
]);
// --- End Mock Data Update ---

const SYSTEM_SETTINGS_COLLECTION = "SystemConfiguration";
const GAME_SETTINGS_DOC_ID = "gameSettings";
const LOCALSTORAGE_LAST_PLAYED_KEY = 'lexiverse_last_played_date';
const LOCALSTORAGE_LAST_RESET_ACK_KEY = 'lexiverse_last_reset_acknowledged_timestamp';


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
  const [isLoadingInitialState, setIsLoadingInitialState] = useState(true);


  const { toast } = useToast();

  useEffect(() => {
    const initialLetters = MOCK_SEEDING_LETTERS_CHARS.map((char, index) => ({
      id: `letter-${index}-${char}`,
      char,
      index,
    }));
    setSeedingLetters(initialLetters);

    const checkAdminResetAndPlayStatus = async () => {
      setIsLoadingInitialState(true);
      try {
        const settingsDocRef = doc(firestore, SYSTEM_SETTINGS_COLLECTION, GAME_SETTINGS_DOC_ID);
        const settingsSnap = await getDoc(settingsDocRef);
        
        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data() as SystemSettings;
          const serverResetTimestamp = settingsData.lastForcedResetTimestamp as Timestamp | undefined;
          
          if (serverResetTimestamp) {
            const localResetAckTimestampStr = localStorage.getItem(LOCALSTORAGE_LAST_RESET_ACK_KEY);
            const localResetAckTime = localResetAckTimestampStr ? parseInt(localResetAckTimestampStr, 10) : 0;
            
            if (serverResetTimestamp.toMillis() > localResetAckTime) {
              localStorage.removeItem(LOCALSTORAGE_LAST_PLAYED_KEY);
              localStorage.setItem(LOCALSTORAGE_LAST_RESET_ACK_KEY, serverResetTimestamp.toMillis().toString());
              toast({ title: "Game Reset", description: "Admin has reset the daily game. You can play again!" });
            }
          }
        }
      } catch (error) {
        console.error("Error checking for admin reset:", error);
        // Non-critical, proceed with normal play status check
      }

      const lastPlayedStorage = localStorage.getItem(LOCALSTORAGE_LAST_PLAYED_KEY);
      const today = new Date().toDateString();
      if (lastPlayedStorage === today) {
        setHasPlayedToday(true);
        setGameState('cooldown');
      } else {
        setHasPlayedToday(false);
        setGameState('idle'); 
      }
      setCurrentPuzzleDate(format(new Date(), 'yyyy-MM-dd'));
      setIsLoadingInitialState(false);
    };

    checkAdminResetAndPlayStatus();

  }, [toast]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCurrentPuzzleDate(format(new Date(), 'yyyy-MM-dd')); 
  };

  const handleGameEnd = () => {
    setGameState('debrief');
    let finalScore = sessionScore;
    if (guessedWotD) {
      finalScore = Math.round(finalScore * 2); 
    }
    setFinalDailyScore(Math.round(finalScore));
    setShowDebrief(true);
    setHasPlayedToday(true);
    localStorage.setItem(LOCALSTORAGE_LAST_PLAYED_KEY, new Date().toDateString());
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

  const handleSubmitWord = async () => {
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
    
    const wordDetails = MOCK_APPROVED_WORDS_MAP.get(wordText);

    if (wordDetails) {
      const points = Math.round(wordText.length * wordDetails.frequency);
      
      if (wordDetails.isWotD) {
        setGuessedWotD(true);
        toast({ title: "Word of the Day!", description: `You found "${wordText}" for ${points} base points!`, className: "bg-accent text-accent-foreground" });
      } else {
         toast({ title: "Word Found!", description: `"${wordText}" is worth ${points} points.`, variant: "default" });
      }

      setSessionScore((prev) => prev + points);
      setSubmittedWords((prev) => [...prev, { id: crypto.randomUUID(), text: wordText, points, isWotD: !!wordDetails.isWotD }]);
      
      // Claimed Word Bonus Logic
      const currentUserUID = auth.currentUser?.uid;
      if (currentUserUID && wordDetails.originalSubmitterUID && wordDetails.originalSubmitterUID !== currentUserUID) {
        try {
          const claimerProfileRef = doc(firestore, "Users", wordDetails.originalSubmitterUID);
          await updateDoc(claimerProfileRef, {
            overallPersistentScore: increment(wordDetails.frequency)
          });
          console.log(`Bonus of ${wordDetails.frequency} points awarded to claimer ${wordDetails.originalSubmitterUID} for word ${wordText}`);
          toast({
            title: "Claimer Bonus!",
            description: `Player ${wordDetails.originalSubmitterUID.substring(0,6)}... (claimer of "${wordText}") got a ${wordDetails.frequency.toFixed(1)} point bonus!`,
            variant: "default"
          });
        } catch (error) {
          console.error("Error awarding bonus to claimer:", error);
        }
      }
      handleClearWord();
    } else {
      setWordToReview(wordText);
      setShowSubmitForReviewDialog(true);
    }
  };

  const fetchWordDataAndSubmit = async (wordToSubmit: string) => {
    setIsSubmittingForReview(true);
    toast({ title: "Checking Word...", description: `Verifying "${wordToSubmit}"...` });

    const apiKey = process.env.NEXT_PUBLIC_WORDSAPI_KEY;
    if (!apiKey || apiKey === "YOUR_WORDSAPI_KEY_PLACEHOLDER" || apiKey.length < 10) {
      console.warn("WordsAPI key not configured or is placeholder. Simulating API call.");
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      const mockApiSuccess = Math.random() > 0.2; 
      
      if (mockApiSuccess) {
        const mockDefinition = `A simulated definition for ${wordToSubmit}.`;
        const mockFrequency = parseFloat((Math.random() * 7).toFixed(2));
        await saveSubmissionToFirestore(wordToSubmit, mockDefinition, mockFrequency);
      } else {
        toast({
          title: "Word Not Recognized (Simulated)",
          description: `"${wordToSubmit}" could not be verified by our dictionary service.`,
          variant: "destructive"
        });
      }
      setIsSubmittingForReview(false);
      handleClearWord();
      return;
    }

    try {
      const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${wordToSubmit.toLowerCase()}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
        }
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error("Word not found in WordsAPI.");
        throw new Error(`WordsAPI request failed with status ${response.status}`);
      }
      const data = await response.json();
      const definition = data.results?.[0]?.definition || "No definition found.";
      const frequency = data.frequencyDetails?.[0]?.zipf || (data.frequency ? parseFloat(data.frequency) : 0);
      
      await saveSubmissionToFirestore(wordToSubmit, definition, frequency);

    } catch (error: any) {
       toast({ title: "Word Verification Failed", description: error.message || `Could not verify "${wordToSubmit}".`, variant: "destructive" });
    } finally {
       setIsSubmittingForReview(false);
       handleClearWord();
    }
  };

  const saveSubmissionToFirestore = async (wordText: string, definition: string, frequency: number) => {
    if (!auth.currentUser) {
        toast({ title: "Authentication Error", description: "You must be logged in to submit words.", variant: "destructive" });
        return;
    }
    const newSubmission: WordSubmission = {
        wordText: wordText.toUpperCase(),
        definition: definition,
        frequency: frequency,
        status: 'PendingModeratorReview',
        submittedByUID: auth.currentUser.uid,
        submittedTimestamp: serverTimestamp(),
        puzzleDateGMT: currentPuzzleDate,
    };
    try {
        await addDoc(collection(firestore, "WordSubmissionsQueue"), newSubmission);
        toast({
        title: "Word Submitted!",
        description: `"${wordText}" (Def: ${definition.substring(0,50)}...) has been sent for review.`,
        variant: "default"
        });
    } catch (error) {
        console.error("Error submitting word to Firestore:", error);
        toast({ title: "Submission Failed", description: "Could not save your word submission. Please try again.", variant: "destructive" });
    }
  }


  const handleSubmitForReviewConfirm = async (submit: boolean) => {
    setShowSubmitForReviewDialog(false);
    if (submit && wordToReview) {
      await fetchWordDataAndSubmit(wordToReview);
    } else {
      toast({ title: "Not Submitted", description: `"${wordToReview}" was not submitted.`, variant: "default" });
      handleClearWord(); 
    }
    setWordToReview("");
  };


  const currentWordText = currentWord.map(l => l.char).join('');
  const selectedLetterIndices = currentWord.map(l => l.index);

  if (isLoadingInitialState) {
    return (
      <div className="flex flex-col items-center justify-center text-center h-full py-12">
        <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
        <h1 className="text-2xl font-headline">Loading Lexiverse...</h1>
      </div>
    );
  }

  if (gameState === 'cooldown') {
    return (
      <div className="flex flex-col items-center justify-center text-center h-full py-12">
        <AlertTriangle className="w-16 h-16 text-primary mb-4" />
        <h1 className="text-3xl font-headline mb-4">Patience, Word Smith!</h1>
        <p className="text-xl text-muted-foreground mb-8">
          You've already played today's Lexiverse puzzle.
        </p>
        <p className="text-lg">A new challenge awaits tomorrow or when an admin resets the day.</p>
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
            Discover the special "Word of the Day" for a massive bonus! Word points are based on length and commonality.
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
              {isSubmittingForReview ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Yes, Check & Submit
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
       <p className="text-xs text-muted-foreground text-center mt-8">
            Note: Word verification (WordsAPI) can be configured with NEXT_PUBLIC_WORDSAPI_KEY.
            If not configured, it will use a SIMULATED call. For production, use a backend function for API calls.
            The "claimed word" bonus currently uses mock data; in production, it would integrate with the master word dictionary.
        </p>
    </div>
  );
}
