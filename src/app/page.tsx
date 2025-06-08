
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
// Game components previously directly used, now mostly in GameScreen
import { DailyDebriefDialog } from '@/components/game/DailyDebriefDialog';
import { ShareMomentDialog } from '@/components/game/ShareMomentDialog';
import { WelcomeInstructionsDialog } from '@/components/game/WelcomeInstructionsDialog';
import type { SeedingLetter, SubmittedWord, GameState, WordSubmission, SystemSettings, MasterWordType, RejectedWordType, UserProfile, CircleInvite, DailyPuzzle } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlayCircle, Check, AlertTriangle, Loader2, ThumbsDown, Users, BellRing, LogIn, UserPlus, Clock, Key, Star, UsersRound, Gift, Info, Handshake, Trophy, Gem, Zap, Users2, CheckSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { firestore, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, Timestamp, writeBatch, getDocs, query, where, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserCircleDailyScoresAction } from '@/app/circles/actions';
import Link from 'next/link';
import { calculateWordScore } from '@/lib/scoring';
import { checkWiktionary } from '@/ai/flows/check-wiktionary-flow';
import { useSearchParams } from 'next/navigation'; // For invite code from URL

// Import new sub-components
import { LoggedOutLandingPage } from '@/components/landing/LoggedOutLandingPage';
import { GameScreen } from '@/components/game/GameScreen';


const DAILY_GAME_DURATION = 90;
const MIN_WORD_LENGTH = 4;

const MOCK_WORD_OF_THE_DAY_TEXT = "LEXIVERSE";
const MOCK_SEEDING_LETTERS_CHARS: string[] = ['L', 'E', 'X', 'I', 'V', 'R', 'S', 'E', 'O'];


const SYSTEM_SETTINGS_COLLECTION = "SystemConfiguration";
const GAME_SETTINGS_DOC_ID = "gameSettings";
const LOCALSTORAGE_LAST_PLAYED_KEY = 'lexiverse_last_played_date';
const LEXIVERSE_LAST_SESSION_RESULTS_KEY = 'lexiverse_last_session_results';
const LOCALSTORAGE_LAST_RESET_ACK_KEY = 'lexiverse_last_reset_acknowledged_timestamp';
const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const CIRCLE_INVITES_COLLECTION = "CircleInvites";


export default function HomePage() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const searchParams = useSearchParams(); // For invite code
  const inviteCodeFromUrl = searchParams.get('inviteCode');

  const [seedingLetters, setSeedingLetters] = useState<SeedingLetter[]>([]);
  const [currentWord, setCurrentWord] = useState<SeedingLetter[]>([]);
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
  const [hasPlayedToday, setHasPlayedToday] = useState(false);
  const [wordInvalidFlash, setWordInvalidFlash] = useState(false);
  const [shareableGameDate, setShareableGameDate] = useState('');
  const [isProcessingWord, setIsProcessingWord] = useState(false);
  const [currentPuzzleDate, setCurrentPuzzleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isLoadingInitialState, setIsLoadingInitialState] = useState(true);

  const [approvedWords, setApprovedWords] = useState<Map<string, MasterWordType>>(new Map());
  const [rejectedWords, setRejectedWords] = useState<Map<string, RejectedWordType>>(new Map());
  const [actualWordOfTheDayText, setActualWordOfTheDayText] = useState<string | null>(null);
  const [actualWordOfTheDayDefinition, setActualWordOfTheDayDefinition] = useState<string | null>(null);
  const [actualWordOfTheDayPoints, setActualWordOfTheDayPoints] = useState<number | null>(null);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [showWelcomeInstructionsModal, setShowWelcomeInstructionsModal] = useState(false);
  const [newlyOwnedWordsThisSession, setNewlyOwnedWordsThisSession] = useState<string[]>([]);


  const { toast } = useToast();

  const initializeGameData = useCallback(async (puzzleDate: string) => {
    setIsLoadingInitialState(true);
    try {
      const puzzleDocRef = doc(firestore, "DailyPuzzles", puzzleDate);
      const puzzleSnap = await getDoc(puzzleDocRef);
      let effectiveWotDText = MOCK_WORD_OF_THE_DAY_TEXT;
      let currentSeedingChars = MOCK_SEEDING_LETTERS_CHARS;
      let wotdDefinition: string | null = "A fun word puzzle game.";
      let wotdPointsFromConfig: number | null = calculateWordScore(MOCK_WORD_OF_THE_DAY_TEXT, 3);


      if (puzzleSnap.exists()) {
        const puzzleData = puzzleSnap.data() as DailyPuzzle;
        effectiveWotDText = puzzleData.wordOfTheDayText.toUpperCase();
        currentSeedingChars = puzzleData.seedingLetters.toUpperCase().split('');
        wotdDefinition = puzzleData.wordOfTheDayDefinition || `Definition for ${effectiveWotDText}`;
        wotdPointsFromConfig = puzzleData.wordOfTheDayPoints;
      } else {
        toast({ title: "Puzzle Data Missing", description: "Using default puzzle for today.", variant: "default"});
      }
      setActualWordOfTheDayText(effectiveWotDText);
      setActualWordOfTheDayDefinition(wotdDefinition);
      setActualWordOfTheDayPoints(wotdPointsFromConfig);
      
      const initialLetters = currentSeedingChars.map((char, index) => ({
        id: `letter-${index}-${char}-${Date.now()}`, 
        char,
        index,
      }));
      setSeedingLetters(initialLetters);

      const approvedWordsSnap = await getDocs(collection(firestore, MASTER_WORDS_COLLECTION));
      const newApprovedMap = new Map<string, MasterWordType>();
      approvedWordsSnap.forEach(docSnap => {
        newApprovedMap.set(docSnap.id, { wordText: docSnap.id, ...docSnap.data() } as MasterWordType);
      });
      setApprovedWords(newApprovedMap);

      const rejectedWordsSnap = await getDocs(collection(firestore, REJECTED_WORDS_COLLECTION));
      const newRejectedMap = new Map<string, RejectedWordType>();
      rejectedWordsSnap.forEach(docSnap => {
        newRejectedMap.set(docSnap.id, { wordText: docSnap.id, ...docSnap.data() } as RejectedWordType);
      });
      setRejectedWords(newRejectedMap);

    } catch (error) {
        console.error("Error initializing game data:", error);
        toast({title: "Game Init Error", description: "Could not load game data. Using defaults.", variant: "destructive"});
         const initialLetters = MOCK_SEEDING_LETTERS_CHARS.map((char, index) => ({
            id: `letter-${index}-${char}-${Date.now()}`, char, index,
        }));
        setSeedingLetters(initialLetters);
        setActualWordOfTheDayText(MOCK_WORD_OF_THE_DAY_TEXT);
        setActualWordOfTheDayDefinition("A fun word puzzle game.");
        setActualWordOfTheDayPoints(calculateWordScore(MOCK_WORD_OF_THE_DAY_TEXT, 3));
    }

    let userCanPlayToday = true;
    const todayAsDateString = new Date().toDateString();

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
              localStorage.removeItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY);
              localStorage.setItem(LOCALSTORAGE_LAST_RESET_ACK_KEY, serverResetTimestamp.toMillis().toString());
              toast({ title: "Game Reset", description: "Admin has reset the daily game. You can play again!" });
              userCanPlayToday = true;
            }
          }
        }
      } catch (error) {
        console.error("Error checking for admin reset:", error);
      }
      
      if (userCanPlayToday) { 
        const storedSessionResultsJSON = localStorage.getItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY);
        if (storedSessionResultsJSON) {
          try {
            const storedResults = JSON.parse(storedSessionResultsJSON);
            if (storedResults.puzzleDateGMT === puzzleDate && storedResults.dateString === todayAsDateString) {
              setFinalDailyScoreForDebrief(storedResults.score);
              setWordsFoundCountForDebrief(storedResults.wordsFoundCount);
              setGuessedWotDForDebrief(storedResults.guessedWotD);
              setNewlyOwnedWordsForDebrief(storedResults.newlyOwnedWords || []);
              setShareableGameDate(storedResults.puzzleDateGMT); 
              setShowDebrief(true);
              userCanPlayToday = false; 
            } else {
              localStorage.removeItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY);
            }
          } catch (e) {
            console.error("Error parsing stored session results:", e);
            localStorage.removeItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY); 
          }
        }
      }

      setHasPlayedToday(!userCanPlayToday);
      setGameState(userCanPlayToday ? 'idle' : 'debrief'); 
      setCurrentPuzzleDate(puzzleDate);
      setIsLoadingInitialState(false);

  }, [toast]);


  useEffect(() => {
    if (!isLoadingAuth && currentUser) { 
        const todayGMTStr = format(new Date(), 'yyyy-MM-dd'); 
        initializeGameData(todayGMTStr);
    } else if (!isLoadingAuth && !currentUser) { 
        setIsLoadingInitialState(false);
        setGameState('idle'); // Or a dedicated 'loggedOut' state if needed
    }
  }, [initializeGameData, isLoadingAuth, currentUser]); 


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

  useEffect(() => {
    if (currentUser && userProfile && !isLoadingAuth && (userProfile.hasSeenWelcomeInstructions === false || userProfile.hasSeenWelcomeInstructions === undefined)) {
      setShowWelcomeInstructionsModal(true);
    }
  }, [currentUser, userProfile, isLoadingAuth]);

  useEffect(() => {
    if (currentUser && !isLoadingAuth) {
      const fetchInvites = async () => {
        try {
          const q = query(
            collection(firestore, CIRCLE_INVITES_COLLECTION),
            where('inviteeUserId', '==', currentUser.uid),
            where('status', '==', 'Sent')
          );
          const invitesSnap = await getDocs(q);
          setPendingInvitesCount(invitesSnap.size);
        } catch (error) {
          console.error("Error fetching pending invites:", error);
        }
      };
      fetchInvites();
    } else if (!currentUser && !isLoadingAuth) {
      setPendingInvitesCount(0);
    }
  }, [currentUser, isLoadingAuth]);

  const startGame = () => {
    if (isLoadingAuth || !currentUser) { 
        toast({title: "Login Required", description: "Please log in or register to play.", variant: "default"});
        return;
    }
    if (hasPlayedToday && !showDebrief) { 
      toast({ title: "Already Played", description: "You've already played today. Come back tomorrow!", variant: "default" });
      return;
    }
    if (showWelcomeInstructionsModal) { 
      toast({ title: "Welcome!", description: "Please read the instructions first.", variant: "default" });
      return;
    }
    setCurrentWord([]);
    setSubmittedWords([]);
    setSessionScore(0);
    setGuessedWotDForDebrief(false); 
    setTimeLeft(DAILY_GAME_DURATION);
    setGameState('playing');
    setNewlyOwnedWordsThisSession([]); 
    const todayGMTStr = format(new Date(), 'yyyy-MM-dd');
    setCurrentPuzzleDate(todayGMTStr); 
    setShareableGameDate(todayGMTStr);
    if(currentPuzzleDate !== todayGMTStr || actualWordOfTheDayText === null) {
        initializeGameData(todayGMTStr);
    }
  };

  const handleCloseWelcomeInstructions = async () => {
    setShowWelcomeInstructionsModal(false);
    if (currentUser && userProfile) {
      try {
        const userDocRef = doc(firestore, "Users", currentUser.uid);
        await updateDoc(userDocRef, {
          hasSeenWelcomeInstructions: true,
        });
      } catch (error) {
        console.error("Error updating welcome instructions status:", error);
        toast({title: "Error", description: "Could not save your preference. Instructions might show again.", variant: "destructive"});
      }
    }
  };

  const handleGameEnd = async () => {
    setGameState('debrief'); 
    let finalScore = sessionScore;
    let wotdGuessedThisSession = false;
    if (submittedWords.some(sw => sw.isWotD)) {
      finalScore = Math.round(finalScore * 2);
      wotdGuessedThisSession = true;
    }

    const roundedFinalScore = Math.round(finalScore);

    setFinalDailyScoreForDebrief(roundedFinalScore);
    setWordsFoundCountForDebrief(submittedWords.length);
    setGuessedWotDForDebrief(wotdGuessedThisSession);
    setNewlyOwnedWordsForDebrief([...newlyOwnedWordsThisSession]);

    setShowDebrief(true);
    setHasPlayedToday(true); 
    
    const todayAsDateString = new Date().toDateString();
    localStorage.setItem(LOCALSTORAGE_LAST_PLAYED_KEY, todayAsDateString); 

    const sessionResultsToStore = {
        puzzleDateGMT: currentPuzzleDate,
        dateString: todayAsDateString,
        score: roundedFinalScore,
        wordsFoundCount: submittedWords.length,
        guessedWotD: wotdGuessedThisSession,
        newlyOwnedWords: [...newlyOwnedWordsThisSession],
    };
    localStorage.setItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY, JSON.stringify(sessionResultsToStore));


    if (currentUser && userProfile) {
        const userDocRef = doc(firestore, "Users", currentUser.uid);
        let newStreakCount = userProfile.wotdStreakCount || 0;

        if (roundedFinalScore < 0) {
            newStreakCount = 0; 
        } else {
            const todayGMTDate = new Date(currentPuzzleDate + "T00:00:00Z"); 
            
            if (wotdGuessedThisSession) { 
                if (userProfile.lastPlayedDate_GMT) {
                    const lastPlayedDate = new Date(userProfile.lastPlayedDate_GMT + "T00:00:00Z");
                    const expectedYesterday = new Date(todayGMTDate);
                    expectedYesterday.setUTCDate(todayGMTDate.getUTCDate() - 1);

                    if (lastPlayedDate.getTime() === expectedYesterday.getTime()) {
                        newStreakCount++;
                    } else {
                        newStreakCount = 1; 
                    }
                } else {
                    newStreakCount = 1;
                }
            } else {
                newStreakCount = 0;
            }
        }
        
        const batch = writeBatch(firestore);
        batch.update(userDocRef, {
            overallPersistentScore: increment(roundedFinalScore),
            lastPlayedDate_GMT: currentPuzzleDate, 
            wotdStreakCount: newStreakCount, 
        });
        
        await batch.commit();
        
        await updateUserCircleDailyScoresAction({
            userId: currentUser.uid,
            puzzleDateGMT: currentPuzzleDate,
            finalDailyScore: roundedFinalScore,
        });
    }
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
    if (gameState !== 'playing' || !currentUser || !userProfile) return;

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
    
    setIsProcessingWord(true);

    let isTheWotDString = false;
    if (actualWordOfTheDayText && wordText === actualWordOfTheDayText.toUpperCase()) {
      isTheWotDString = true;
    }

    const approvedWordDetails = approvedWords.get(wordText);

    if (isTheWotDString) {
      let wotdSessionPoints = 0;
      let newlyClaimedWotD = false;

      if (approvedWordDetails) { 
        wotdSessionPoints = calculateWordScore(wordText, approvedWordDetails.frequency);
        if (!approvedWordDetails.originalSubmitterUID) { 
          const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText);
          await updateDoc(wordDocRef, {
            originalSubmitterUID: currentUser.uid,
            puzzleDateGMTOfSubmission: currentPuzzleDate,
          });
          newlyClaimedWotD = true;
          setNewlyOwnedWordsThisSession(prev => [...prev, wordText]);
          setApprovedWords(prevMap => new Map(prevMap).set(wordText, {...approvedWordDetails, originalSubmitterUID: currentUser.uid}));
          toast({ title: "Amazing!", description: `You own the Word of the Day "${wordText}"! It's worth ${wotdSessionPoints} base points.`, className: "bg-accent text-accent-foreground" });
        } else if (approvedWordDetails.originalSubmitterUID && approvedWordDetails.originalSubmitterUID !== currentUser.uid) {
          try {
            const claimerProfileRef = doc(firestore, "Users", approvedWordDetails.originalSubmitterUID);
            await updateDoc(claimerProfileRef, { overallPersistentScore: increment(wotdSessionPoints) });
            toast({ title: "WotD Claimer Bonus!", description: `Original submitter of WotD "${wordText}" got a bonus of ${wotdSessionPoints} points!`, variant: "default"});
          } catch (error) { console.error("Error awarding WotD claimer bonus:", error); }
        } else { 
             toast({ title: "Word of the Day!", description: `You found "${wordText}" for ${wotdSessionPoints} base points! (Bonus applied at end)`, className: "bg-accent text-accent-foreground" });
        }
      } else { 
        wotdSessionPoints = actualWordOfTheDayPoints || calculateWordScore(wordText, 3); 
        const definitionForSubmission = actualWordOfTheDayDefinition || `Definition for Word of the Day: ${wordText}`;
        const frequencyForSubmission = actualWordOfTheDayPoints ? Math.max(1, actualWordOfTheDayPoints / Math.max(MIN_WORD_LENGTH, wordText.length)) : 3;
        await saveWordToSubmissionQueue(wordText, definitionForSubmission, frequencyForSubmission, true); 
      }

      setSessionScore((prev) => prev + wotdSessionPoints);
      setSubmittedWords((prev) => [...prev, { id: crypto.randomUUID(), text: wordText, points: wotdSessionPoints, isWotD: true, newlyOwned: newlyClaimedWotD }]);
      handleClearWord();
      setIsProcessingWord(false);
      return;
    }

    if (approvedWordDetails) { 
      const points = calculateWordScore(wordText, approvedWordDetails.frequency);
      let newlyClaimedRegularWord = false;

      if (!approvedWordDetails.originalSubmitterUID) { 
        const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText);
        await updateDoc(wordDocRef, {
          originalSubmitterUID: currentUser.uid,
          puzzleDateGMTOfSubmission: currentPuzzleDate,
        });
        newlyClaimedRegularWord = true;
        setNewlyOwnedWordsThisSession(prev => [...prev, wordText]);
        setApprovedWords(prevMap => new Map(prevMap).set(wordText, {...approvedWordDetails, originalSubmitterUID: currentUser.uid}));
        toast({ title: "Amazing!", description: `You own "${wordText}"! It's worth ${points} points.` });
      } else if (approvedWordDetails.originalSubmitterUID === currentUser.uid) { 
        toast({ title: "Word Found!", description: `"${wordText}" is worth ${points} points.`, variant: "default" });
      } else { 
         try {
          const claimerProfileRef = doc(firestore, "Users", approvedWordDetails.originalSubmitterUID);
           await updateDoc(claimerProfileRef, { overallPersistentScore: increment(points) });
          toast({ title: "Word Found & Claimer Bonus!", description: `"${wordText}" worth ${points} pts. Original submitter got a bonus!`, variant: "default"});
        } catch (error) { 
            console.error("Error awarding claimer bonus:", error); 
            toast({ title: "Word Found!", description: `"${wordText}" is worth ${points} points.`, variant: "default" });
        }
      }
      
      setSessionScore((prev) => prev + points);
      setSubmittedWords((prev) => [...prev, { id: crypto.randomUUID(), text: wordText, points, isWotD: false, newlyOwned: newlyClaimedRegularWord }]);
      handleClearWord();
      setIsProcessingWord(false);
      return;
    }

    const rejectedWordDetails = rejectedWords.get(wordText);
    if (rejectedWordDetails) {
      if (rejectedWordDetails.rejectionType === 'Gibberish') {
        const pointsDeducted = calculateWordScore(wordText, 7); 
        setSessionScore(prev => prev - pointsDeducted); 
        toast({
          title: "Word Rejected",
          description: `"${wordText}" is not a valid word. ${pointsDeducted} points deducted from session score.`,
          variant: "destructive",
        });
      } else { 
        toast({
          title: "Word Not Allowed",
          description: `"${wordText}" is not allowed in the game.`,
          variant: "default",
        });
      }
      triggerInvalidWordFlash();
      handleClearWord();
      setIsProcessingWord(false);
      return;
    }
    
    const apiKey = process.env.NEXT_PUBLIC_WORDSAPI_KEY;
    if (!apiKey || apiKey === "YOUR_WORDSAPI_KEY_PLACEHOLDER" || apiKey.length < 10) {
      console.warn("WordsAPI key not configured. Falling back to Wiktionary check.");
      try {
        const wiktionaryResult = await checkWiktionary({ word: wordText });
        if (wiktionaryResult.exists && wiktionaryResult.definition) {
          const bonusPoints = 20;
          setSessionScore(prev => prev + bonusPoints);
          toast({ title: "Great Word!", description: `You've found a great word, I'm giving you ${bonusPoints} extra points and sending it off to be evaluated.`, className: "bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100" });
          await saveWordToSubmissionQueue(wordText, wiktionaryResult.definition, 3.5, false);
        } else {
          toast({ title: "Unknown Word", description: `"${wordText}" was not found in our dictionaries.`, variant: "default" });
          triggerInvalidWordFlash();
        }
      } catch (wiktionaryError) {
        console.error("Error during Wiktionary check (fallback):", wiktionaryError);
        toast({ title: "Your word has gone off for moderation.", variant: "default" });
        await saveWordToSubmissionQueue(wordText, "Wiktionary check failed, requires manual review.", 3.0, false);
      }
      handleClearWord();
      setIsProcessingWord(false);
      return;
    }

    try {
      const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${wordText.toLowerCase()}`, {
        method: 'GET',
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com' }
      });

      if (response.ok) {
        const data = await response.json();
        const definition = data.results?.[0]?.definition || "No definition provided.";
        let frequency = 3.5; 
        if (data.frequencyDetails?.[0]?.zipf) {
          frequency = parseFloat(data.frequencyDetails[0].zipf);
        } else if (data.frequency && typeof data.frequency === 'number') { 
          frequency = data.frequency;
        }
        if (isNaN(frequency) || frequency <= 0) frequency = 3.5;
        
        const points = calculateWordScore(wordText, frequency);
        const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText);
        const newMasterWordEntry: MasterWordType = {
            wordText: wordText, definition, frequency, status: 'Approved',
            addedByUID: currentUser.uid, dateAdded: serverTimestamp() as Timestamp,
            originalSubmitterUID: currentUser.uid, puzzleDateGMTOfSubmission: currentPuzzleDate,
        };
        await setDoc(wordDocRef, newMasterWordEntry);

        setSessionScore((prev) => prev + points);
        setSubmittedWords((prev) => [...prev, { id: crypto.randomUUID(), text: wordText, points, isWotD: false, newlyOwned: true }]);
        setApprovedWords(prevMap => new Map(prevMap).set(wordText, newMasterWordEntry));
        setNewlyOwnedWordsThisSession(prev => [...prev, wordText]);
        toast({ title: "Word Claimed!", description: `You found and claimed "${wordText}" for ${points} points!`, className: "bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100"});
      
      } else if (response.status === 404) {
        try {
          const wiktionaryResult = await checkWiktionary({ word: wordText });
          if (wiktionaryResult.exists && wiktionaryResult.definition) {
            const bonusPoints = 20;
            setSessionScore(prev => prev + bonusPoints);
            toast({ title: "Great Word!", description: `You've found a great word, I'm giving you ${bonusPoints} extra points and sending it off to be evaluated.`, className: "bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100" });
            await saveWordToSubmissionQueue(wordText, wiktionaryResult.definition, 3.5, false);
          } else {
            toast({ title: "Unknown Word", description: `"${wordText}" was not found in our dictionaries.`, variant: "default" });
            triggerInvalidWordFlash();
          }
        } catch (wiktionaryError) {
          console.error("Error during Wiktionary check (main path):", wiktionaryError);
          toast({ title: "Your word has gone off for moderation.", variant: "default" });
          await saveWordToSubmissionQueue(wordText, "Wiktionary check failed, requires manual review.", 3.0, false);
        }
      } else {
        toast({ title: "Validation Error", description: `Could not verify "${wordText}" (API error). Try again or contact support.`, variant: "destructive"});
        triggerInvalidWordFlash();
      }
    } catch (error: any) {
       toast({ title: "Validation Failed", description: `${error.message || `Could not verify "${wordText}"`}.`, variant: "destructive" });
       triggerInvalidWordFlash();
    } finally {
       handleClearWord();
       setIsProcessingWord(false);
    }
  };

  const saveWordToSubmissionQueue = async (wordText: string, definition?: string, frequency?: number, isWotDClaim: boolean = false) => {
    if (!currentUser) {
        toast({ title: "Authentication Error", description: "You must be logged in to submit words.", variant: "destructive" });
        return;
    }
    const wordUpperCase = wordText.toUpperCase();
    const q = query(
        collection(firestore, WORD_SUBMISSIONS_QUEUE),
        where("wordText", "==", wordUpperCase),
        where("status", "==", "PendingModeratorReview")
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        toast({ title: "Already Pending", description: `"${wordUpperCase}" is already pending review.`, variant: "default" });
        handleClearWord(); 
        return;
    }
    const newSubmission: Omit<WordSubmission, 'id' | 'submittedTimestamp'> = { 
        wordText: wordUpperCase,
        definition: definition || "No definition provided.",
        frequency: frequency || 3.5, 
        status: 'PendingModeratorReview',
        submittedByUID: currentUser.uid,
        puzzleDateGMT: currentPuzzleDate,
        isWotDClaim: isWotDClaim, 
    };
    try {
        await addDoc(collection(firestore, WORD_SUBMISSIONS_QUEUE), { ...newSubmission, submittedTimestamp: serverTimestamp() as Timestamp });
        if (definition && !definition.startsWith("Wiktionary check failed")) {
            toast({ title: "Word Submitted!", description: `"${wordText}" has been sent for admin review.`, variant: "default" });
        }
    } catch (error) {
        console.error("Error submitting word to queue:", error);
        toast({ title: "Submission Failed", description: "Could not save your word submission. Please try again.", variant: "destructive" });
    }
  }


  const currentWordText = currentWord.map(l => l.char).join('');
  const selectedLetterIndices = currentWord.map(l => l.index);

  if (isLoadingAuth || isLoadingInitialState) {
    return (
      <div className="flex flex-col items-center justify-center text-center h-full py-12">
        <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
        <h1 className="text-2xl font-headline">Loading LexiVerse...</h1>
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
          currentWord={currentWord}
          currentWordText={currentWordText}
          wordInvalidFlash={wordInvalidFlash}
          seedingLetters={seedingLetters}
          onLetterClick={handleLetterClick}
          selectedLetterIndices={selectedLetterIndices}
          onSubmitWord={handleSubmitWord}
          onClearWord={handleClearWord}
          onBackspace={handleBackspace}
          isProcessingWord={isProcessingWord}
          submittedWords={submittedWords}
          wotdFound={submittedWords.some(sw => sw.isWotD)}
          hasPlayedToday={hasPlayedToday}
          onStartGame={startGame}
          isLoadingAuth={isLoadingAuth}
          isCurrentUser={!!currentUser}
          showWelcomeInstructionsModal={showWelcomeInstructionsModal}
          showDebrief={showDebrief}
          pendingInvitesCount={pendingInvitesCount}
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
          setShareableGameDate(currentPuzzleDate); 
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
