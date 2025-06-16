
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { DailyDebriefDialog } from '@/components/game/DailyDebriefDialog';
import { ShareMomentDialog } from '@/components/game/ShareMomentDialog';
import { WelcomeInstructionsDialog } from '@/components/game/WelcomeInstructionsDialog';
import type { SeedingLetter, SubmittedWord, GameState, UserProfile, ClientMasterWordType } from '@/types'; // Import ClientMasterWordType
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { firestore } from '@/lib/firebase';
import { doc, updateDoc, increment, Timestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserCircleDailyScoresAction } from '@/app/circles/actions';
import { useSearchParams } from 'next/navigation';

import { LoggedOutLandingPage } from '@/components/landing/LoggedOutLandingPage';
import { GameScreen } from '@/components/game/GameScreen';
import { useGameData } from '@/hooks/useGameData'; 
import { processWordSubmission, type ProcessedWordResult } from '@/services/wordProcessingService'; 

const DAILY_GAME_DURATION = 90;
const MIN_WORD_LENGTH = 4;
const LEXIVERSE_LAST_SESSION_RESULTS_KEY = 'lexiverse_last_session_results';

export default function HomePage() {
  const { currentUser, userProfile, isLoadingAuth, setUserProfile } = useAuth();
  const searchParams = useSearchParams();
  const inviteCodeFromUrl = searchParams.get('inviteCode');

  const gameData = useGameData(currentUser, userProfile);

  const [currentWordUI, setCurrentWordUI] = useState<SeedingLetter[]>([]);
  const [submittedWords, setSubmittedWords] = useState<SubmittedWord[]>([]);
  const [timeLeft, setTimeLeft] = useState(DAILY_GAME_DURATION);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [sessionScore, setSessionScore] = useState(0);
  
  const [finalDailyScoreForDebrief, setFinalDailyScoreForDebrief] = useState(0);
  const [guessedWotDForDebrief, setGuessedWotDForDebrief] = useState(false);
  const [wordsFoundCountForDebrief, setWordsFoundCountForDebrief] = useState(0);
  const [newlyOwnedWordsForDebrief, setNewlyOwnedWordsForDebrief] = useState<string[]>([]);

  const [showDebrief, setShowDebrief] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [wordInvalidFlash, setWordInvalidFlash] = useState(false);
  const [shareableGameDate, setShareableGameDate] = useState('');
  const [isProcessingWord, setIsProcessingWord] = useState(false);
  const [showWelcomeInstructionsModal, setShowWelcomeInstructionsModal] = useState(false);
  const [newlyOwnedWordsThisSession, setNewlyOwnedWordsThisSession] = useState<string[]>([]);
  
  const [sessionApprovedWords, setSessionApprovedWords] = useState<Map<string, ClientMasterWordType>>(new Map()); // Changed to ClientMasterWordType

  const { toast } = useToast();

  useEffect(() => {
    setSessionApprovedWords(gameData.approvedWords);
  }, [gameData.approvedWords]);

  useEffect(() => {
    if (!isLoadingAuth && currentUser && userProfile && (userProfile.hasSeenWelcomeInstructions === false || userProfile.hasSeenWelcomeInstructions === undefined)) {
      setShowWelcomeInstructionsModal(true);
    }
  }, [currentUser, userProfile, isLoadingAuth]);
  
  useEffect(() => {
    if (!gameData.isLoadingGameData && gameData.initialDebriefData && currentUser) {
      setFinalDailyScoreForDebrief(gameData.initialDebriefData.score);
      setWordsFoundCountForDebrief(gameData.initialDebriefData.wordsFoundCount);
      setGuessedWotDForDebrief(gameData.initialDebriefData.guessedWotD);
      setNewlyOwnedWordsForDebrief(gameData.initialDebriefData.newlyOwnedWords || []);
      setShareableGameDate(gameData.initialDebriefData.puzzleDateGMT);
      setShowDebrief(true);
      setGameState('debrief');
    } else if (!gameData.isLoadingGameData && currentUser) {
      setGameState('idle');
    }
  }, [gameData.isLoadingGameData, gameData.initialDebriefData, currentUser]);


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
    if (isLoadingAuth || !currentUser || gameData.isLoadingGameData) return;
    if (gameData.hasPlayedToday && !showDebrief) {
      toast({ title: "Already Played", description: "You've already played today. Come back tomorrow!", variant: "default" });
      return;
    }
    if (showWelcomeInstructionsModal) {
      toast({ title: "Welcome!", description: "Please read the instructions first.", variant: "default" });
      return;
    }
    setCurrentWordUI([]);
    setSubmittedWords([]);
    setSessionScore(0);
    setGuessedWotDForDebrief(false);
    setTimeLeft(DAILY_GAME_DURATION);
    setGameState('playing');
    setNewlyOwnedWordsThisSession([]);
    setShareableGameDate(gameData.currentPuzzleDate);
  };

  const handleCloseWelcomeInstructions = async () => {
    setShowWelcomeInstructionsModal(false);
    if (currentUser && setUserProfile && userProfile) { 
      try {
        const userDocRef = doc(firestore, "Users", currentUser.uid);
        await updateDoc(userDocRef, { hasSeenWelcomeInstructions: true });
        setUserProfile(prev => prev ? { ...prev, hasSeenWelcomeInstructions: true } : null);
      } catch (error) {
        console.error("Error updating welcome instructions status:", error);
        toast({title: "Error", description: "Could not save your preference.", variant: "destructive"});
      }
    }
  };

  const handleGameEnd = async () => {
    setGameState('debrief');
    let finalScore = sessionScore;
    let wotdGuessedThisSession = submittedWords.some(sw => sw.isWotD);
    if (wotdGuessedThisSession) {
      finalScore = Math.round(finalScore * 2);
    }
    const roundedFinalScore = Math.round(finalScore);

    setFinalDailyScoreForDebrief(roundedFinalScore);
    setWordsFoundCountForDebrief(submittedWords.length);
    setGuessedWotDForDebrief(wotdGuessedThisSession);
    setNewlyOwnedWordsForDebrief([...newlyOwnedWordsThisSession]);
    setShowDebrief(true);
    
    localStorage.setItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY, JSON.stringify({
        puzzleDateGMT: gameData.currentPuzzleDate,
        dateString: new Date().toDateString(),
        score: roundedFinalScore,
        wordsFoundCount: submittedWords.length,
        guessedWotD: wotdGuessedThisSession,
        newlyOwnedWords: [...newlyOwnedWordsThisSession],
    }));

    if (currentUser && userProfile) {
        const userDocRef = doc(firestore, "Users", currentUser.uid);
        let newStreakCount = userProfile.wotdStreakCount || 0;
        if (roundedFinalScore < 0) newStreakCount = 0;
        else if (wotdGuessedThisSession) {
            if (userProfile.lastPlayedDate_GMT) {
                const lastPlayedDate = new Date(userProfile.lastPlayedDate_GMT + "T00:00:00Z");
                const todayGMTDate = new Date(gameData.currentPuzzleDate + "T00:00:00Z");
                const expectedYesterday = new Date(todayGMTDate);
                expectedYesterday.setUTCDate(todayGMTDate.getUTCDate() - 1);
                if (lastPlayedDate.getTime() === expectedYesterday.getTime()) newStreakCount++;
                else newStreakCount = 1;
            } else newStreakCount = 1;
        } else newStreakCount = 0;
        
        const batch = writeBatch(firestore);
        batch.update(userDocRef, {
            overallPersistentScore: increment(roundedFinalScore),
            lastPlayedDate_GMT: gameData.currentPuzzleDate,
            wotdStreakCount: newStreakCount,
        });
        await batch.commit();
        
        await updateUserCircleDailyScoresAction({
            userId: currentUser.uid,
            puzzleDateGMT: gameData.currentPuzzleDate,
            finalDailyScore: roundedFinalScore,
        });
        
        if (setUserProfile) {
          setUserProfile(prev => prev ? ({
            ...prev,
            overallPersistentScore: prev.overallPersistentScore + roundedFinalScore,
            lastPlayedDate_GMT: gameData.currentPuzzleDate,
            wotdStreakCount: newStreakCount
          }) : null);
        }
    }
  };

  const handleLetterClick = useCallback((letter: SeedingLetter) => {
    if (gameState !== 'playing') return;
    if (!currentWordUI.find(l => l.id === letter.id)) {
       setCurrentWordUI((prev) => [...prev, letter]);
    }
  }, [gameState, currentWordUI]);

  const handleBackspace = () => {
    if (gameState !== 'playing') return;
    setCurrentWordUI((prev) => prev.slice(0, -1));
  };

  const handleClearWord = () => {
    if (gameState !== 'playing') return;
    setCurrentWordUI([]);
  };
  
  const triggerInvalidWordFlash = () => {
    setWordInvalidFlash(true);
    setTimeout(() => setWordInvalidFlash(false), 300);
  };

  const handleSubmitWord = async () => {
    if (gameState !== 'playing' || !currentUser || !userProfile) return;
    const wordText = currentWordUI.map(l => l.char).join('').toUpperCase();

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
    
    setIsProcessingWord(true);
    try {
      const result: ProcessedWordResult = await processWordSubmission({
        wordText: wordText,
        currentUserId: currentUser.uid,
        currentPuzzleDate: gameData.currentPuzzleDate,
        actualWordOfTheDayText: gameData.actualWordOfTheDayText,
        actualWordOfTheDayDefinition: gameData.actualWordOfTheDayDefinition,
        actualWordOfTheDayPoints: gameData.actualWordOfTheDayPoints,
      });

      toast({ title: result.status.includes('success') ? "Word Update!" : "Word Info", description: result.message, variant: result.status.includes('error') || result.status.includes('rejected') ? "destructive" : "default" });

      if (result.status.includes('success')) {
        setSessionScore(prev => prev + result.pointsAwarded);
        setSubmittedWords(prev => [...prev, { id: crypto.randomUUID(), text: wordText, points: result.pointsAwarded, isWotD: result.isWotD || false, newlyOwned: result.isNewlyOwned }]);
        if (result.isNewlyOwned && result.newlyOwnedWordText) {
          setNewlyOwnedWordsThisSession(prev => [...prev, result.newlyOwnedWordText!]);
        }
        if (result.updatedMasterWordEntry) {
          setSessionApprovedWords(prevMap => new Map(prevMap).set(result.updatedMasterWordEntry!.wordText, result.updatedMasterWordEntry!));
        }
      } else if (result.status.includes('rejected')) {
        triggerInvalidWordFlash();
        if (result.status === 'rejected_gibberish') {
            setSessionScore(prev => prev + result.pointsAwarded); 
        }
      }
    } catch (error: any) {
      toast({ title: "Submission Error", description: error.message || "Could not process your word.", variant: "destructive" });
      triggerInvalidWordFlash();
    } finally {
      handleClearWord();
      setIsProcessingWord(false);
    }
  };

  const currentWordText = currentWordUI.map(l => l.char).join('');
  const selectedLetterIndices = currentWordUI.map(l => l.index);

  if (isLoadingAuth || gameData.isLoadingGameData) {
    return (
      <div className="flex flex-col items-center justify-center text-center h-full py-12 min-h-[calc(100vh-20rem)]">
        <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
        <h1 className="text-2xl font-headline text-muted-foreground">Loading LexiVerse...</h1>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-2 pt-4 sm:p-4 sm:pt-8 md:p-6 md:pt-10 lg:p-8 lg:pt-12">
      <WelcomeInstructionsDialog
        isOpen={showWelcomeInstructionsModal}
        onOpenChange={setShowWelcomeInstructionsModal}
        onConfirm={handleCloseWelcomeInstructions}
      />

      {!currentUser ? (
        <LoggedOutLandingPage inviteCodeFromUrl={inviteCodeFromUrl} />
      ) : (
        <GameScreen
          gameState={gameState}
          sessionScore={sessionScore}
          timeLeft={timeLeft}
          currentWord={currentWordUI}
          currentWordText={currentWordText}
          wordInvalidFlash={wordInvalidFlash}
          seedingLetters={gameData.seedingLetters}
          onLetterClick={handleLetterClick}
          selectedLetterIndices={selectedLetterIndices}
          onSubmitWord={handleSubmitWord}
          onClearWord={handleClearWord}
          onBackspace={handleBackspace}
          isProcessingWord={isProcessingWord}
          submittedWords={submittedWords}
          wotdFound={submittedWords.some(sw => sw.isWotD)}
          hasPlayedToday={gameData.hasPlayedToday}
          onStartGame={startGame}
          isLoadingAuth={isLoadingAuth}
          isCurrentUser={!!currentUser}
          showWelcomeInstructionsModal={showWelcomeInstructionsModal}
          showDebrief={showDebrief}
          pendingInvitesCount={gameData.pendingInvitesCount}
        />
      )}
      
      <DailyDebriefDialog
        isOpen={showDebrief}
        onOpenChange={(open) => {
            setShowDebrief(open);
            if (!open) setGameState('idle'); 
        }}
        score={finalDailyScoreForDebrief}
        wordsFoundCount={wordsFoundCountForDebrief}
        guessedWotD={guessedWotDForDebrief}
        onShare={() => {
          setShowDebrief(false); 
          setShareableGameDate(gameData.currentPuzzleDate); 
          setShowShareModal(true);
        }}
        userProfile={userProfile} 
        circleId={userProfile?.activeCircleId} 
        circleName={userProfile?.activeCircleId ? "Your Circle" : undefined} 
        newlyOwnedWords={newlyOwnedWordsForDebrief} 
      />
      
      <ShareMomentDialog
        isOpen={showShareModal}
        onOpenChange={setShowShareModal}
        gameData={{
          score: finalDailyScoreForDebrief,
          guessedWotD: guessedWotDForDebrief,
          wordsFoundCount: wordsFoundCountForDebrief,
          date: shareableGameDate, 
          circleName: userProfile?.activeCircleId ? "Your Circle" : undefined, 
          newlyClaimedWordsCount: newlyOwnedWordsForDebrief.length,
        }}
      />
    </div>
  );
}
