
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import type { SeedingLetter, DailyPuzzle, SystemSettings, CircleInvite, UserProfile } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { calculateWordScore } from '@/lib/scoring';

const DAILY_PUZZLES_COLLECTION = "DailyPuzzles";
const SYSTEM_SETTINGS_COLLECTION = "SystemConfiguration";
const GAME_SETTINGS_DOC_ID = "gameSettings";
const CIRCLE_INVITES_COLLECTION = "CircleInvites";
const LOCALSTORAGE_LAST_PLAYED_KEY = 'lexiverse_last_played_date';
const LEXIVERSE_LAST_SESSION_RESULTS_KEY = 'lexiverse_last_session_results';
const LOCALSTORAGE_LAST_RESET_ACK_KEY = 'lexiverse_last_reset_acknowledged_timestamp';

const MOCK_WORD_OF_THE_DAY_TEXT = "LEXIVERSE"; // Fallback
const MOCK_SEEDING_LETTERS_CHARS: string[] = ['L', 'E', 'X', 'I', 'V', 'R', 'S', 'E', 'O']; // Fallback

interface GameData {
  isLoadingGameData: boolean;
  seedingLetters: SeedingLetter[];
  actualWordOfTheDayText: string | null;
  actualWordOfTheDayDefinition: string | null;
  actualWordOfTheDayPoints: number | null;
  hasPlayedToday: boolean;
  initialDebriefData: {
    score: number;
    wordsFoundCount: number;
    guessedWotD: boolean;
    newlyOwnedWords: string[];
    puzzleDateGMT: string;
  } | null;
  currentPuzzleDate: string;
  pendingInvitesCount: number;
}

export function useGameData(currentUser: FirebaseUser | null, userProfile: UserProfile | null): GameData {
  const [isLoadingGameData, setIsLoadingGameData] = useState(true);
  const [seedingLetters, setSeedingLetters] = useState<SeedingLetter[]>([]);
  const [actualWordOfTheDayText, setActualWordOfTheDayText] = useState<string | null>(null);
  const [actualWordOfTheDayDefinition, setActualWordOfTheDayDefinition] = useState<string | null>(null);
  const [actualWordOfTheDayPoints, setActualWordOfTheDayPoints] = useState<number | null>(null);
  const [hasPlayedTodayState, setHasPlayedTodayState] = useState(false);
  const [initialDebriefData, setInitialDebriefData] = useState<{
    score: number;
    wordsFoundCount: number;
    guessedWotD: boolean;
    newlyOwnedWords: string[];
    puzzleDateGMT: string;
  } | null>(null);
  const [currentPuzzleDate, setCurrentPuzzleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);

  const { toast } = useToast();

  const fetchCoreGameData = useCallback(async (puzzleDate: string) => {
    let effectiveWotDText = MOCK_WORD_OF_THE_DAY_TEXT;
    let currentSeedingChars = MOCK_SEEDING_LETTERS_CHARS;
    let wotdDefinition: string | null = "A fun word puzzle game.";
    let wotdPointsFromConfig: number | null = calculateWordScore(MOCK_WORD_OF_THE_DAY_TEXT, 3);

    try {
      const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, puzzleDate);
      const puzzleSnap = await getDoc(puzzleDocRef);

      if (puzzleSnap.exists()) {
        const puzzleData = puzzleSnap.data() as DailyPuzzle;
        effectiveWotDText = puzzleData.wordOfTheDayText.toUpperCase();
        currentSeedingChars = puzzleData.seedingLetters.toUpperCase().split('');
        wotdDefinition = puzzleData.wordOfTheDayDefinition || `Definition for ${effectiveWotDText}`;
        wotdPointsFromConfig = puzzleData.wordOfTheDayPoints;
      } else {
        toast({ title: "Puzzle Data Missing", description: "Using default puzzle for today.", variant: "default" });
      }
    } catch (error) {
      console.error("Error fetching puzzle data:", error);
      toast({ title: "Puzzle Load Error", description: "Could not load puzzle data. Using defaults.", variant: "destructive" });
    }
    setActualWordOfTheDayText(effectiveWotDText);
    setActualWordOfTheDayDefinition(wotdDefinition);
    setActualWordOfTheDayPoints(wotdPointsFromConfig);
    const initialLetters = currentSeedingChars.map((char, index) => ({
      id: `letter-${index}-${char}-${Date.now()}`, char, index,
    }));
    setSeedingLetters(initialLetters);
  }, [toast]);

  const checkPlayStatusAndDebrief = useCallback(async (puzzleDate: string) => {
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
          }
        }
      }
    } catch (error) {
      console.error("Error checking for admin reset:", error);
    }

    const storedSessionResultsJSON = localStorage.getItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY);
    if (storedSessionResultsJSON) {
      try {
        const storedResults = JSON.parse(storedSessionResultsJSON);
        if (storedResults.puzzleDateGMT === puzzleDate && storedResults.dateString === todayAsDateString) {
          setInitialDebriefData(storedResults);
          userCanPlayToday = false;
        } else {
          localStorage.removeItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY);
        }
      } catch (e) {
        console.error("Error parsing stored session results:", e);
        localStorage.removeItem(LEXIVERSE_LAST_SESSION_RESULTS_KEY);
      }
    }
    setHasPlayedTodayState(!userCanPlayToday);
    return userCanPlayToday;
  }, [toast]);

  useEffect(() => {
    if (currentUser) {
      setIsLoadingGameData(true);
      const todayGMTStr = format(new Date(), 'yyyy-MM-dd');
      setCurrentPuzzleDate(todayGMTStr);

      Promise.all([
        fetchCoreGameData(todayGMTStr),
        checkPlayStatusAndDebrief(todayGMTStr),
        (async () => {
          try {
            const q = query(collection(firestore, CIRCLE_INVITES_COLLECTION), where('inviteeUserId', '==', currentUser.uid), where('status', '==', 'Sent'));
            const invitesSnap = await getDocs(q);
            setPendingInvitesCount(invitesSnap.size);
          } catch (error) {
            console.error("Error fetching pending invites:", error);
          }
        })()
      ]).finally(() => {
        setIsLoadingGameData(false);
      });
    } else {
      // Reset or set defaults for logged-out state
      setIsLoadingGameData(false);
      setSeedingLetters(MOCK_SEEDING_LETTERS_CHARS.map((char, index) => ({ id: `letter-${index}-${char}`, char, index })));
      setActualWordOfTheDayText(MOCK_WORD_OF_THE_DAY_TEXT);
      setActualWordOfTheDayDefinition("A fun word puzzle game.");
      setActualWordOfTheDayPoints(calculateWordScore(MOCK_WORD_OF_THE_DAY_TEXT, 3));
      setHasPlayedTodayState(false);
      setInitialDebriefData(null);
      setPendingInvitesCount(0);
    }
  }, [currentUser, fetchCoreGameData, checkPlayStatusAndDebrief, toast]);

  return {
    isLoadingGameData,
    seedingLetters,
    actualWordOfTheDayText,
    actualWordOfTheDayDefinition,
    actualWordOfTheDayPoints,
    hasPlayedToday: hasPlayedTodayState,
    initialDebriefData,
    currentPuzzleDate,
    pendingInvitesCount,
  };
}
