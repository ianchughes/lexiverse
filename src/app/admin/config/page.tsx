
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { firestore } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, Zap, Save, Smile } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { SystemSettings } from '@/types';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

const SYSTEM_SETTINGS_COLLECTION = "SystemConfiguration";
const GAME_SETTINGS_DOC_ID = "gameSettings";
const DEFAULT_UI_TONE = 5;

export default function SystemConfigurationPage() {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [uiTone, setUiTone] = useState<number>(DEFAULT_UI_TONE);
  const [isSavingTone, setIsSavingTone] = useState(false);

  const fetchSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const settingsDocRef = doc(firestore, SYSTEM_SETTINGS_COLLECTION, GAME_SETTINGS_DOC_ID);
      const settingsSnap = await getDoc(settingsDocRef);
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data() as SystemSettings;
        setUiTone(settingsData.uiTone ?? DEFAULT_UI_TONE);
      } else {
        setUiTone(DEFAULT_UI_TONE);
      }
    } catch (error: any) {
      console.error("Error fetching system settings:", error);
      toast({ title: "Error", description: "Could not load system settings.", variant: "destructive" });
      setUiTone(DEFAULT_UI_TONE);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleForceDailyReset = async () => {
    setIsResetting(true);
    try {
      const settingsDocRef = doc(firestore, SYSTEM_SETTINGS_COLLECTION, GAME_SETTINGS_DOC_ID);
      const newSettings: Partial<SystemSettings> = {
        lastForcedResetTimestamp: serverTimestamp(),
      };
      await setDoc(settingsDocRef, newSettings, { merge: true });
      toast({
        title: "Daily Reset Triggered",
        description: "The daily game play limit has been reset. Users will be able to play again on their next visit/refresh.",
      });
    } catch (error: any) {
      console.error("Error forcing daily reset:", error);
      toast({
        title: "Error",
        description: `Could not trigger daily reset: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSaveUiTone = async () => {
    setIsSavingTone(true);
    try {
      const settingsDocRef = doc(firestore, SYSTEM_SETTINGS_COLLECTION, GAME_SETTINGS_DOC_ID);
      await setDoc(settingsDocRef, { uiTone: uiTone }, { merge: true });
      toast({
        title: "UI Tone Saved",
        description: `Friendliness level set to ${uiTone}.`,
      });
    } catch (error: any) {
      console.error("Error saving UI tone:", error);
      toast({
        title: "Error",
        description: `Could not save UI tone: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSavingTone(false);
    }
  };

  const getToneDescription = (tone: number): string => {
    if (tone <= 2) return "Jovial & Playful";
    if (tone <= 4) return "Friendly & Casual";
    if (tone <= 6) return "Neutral & Helpful";
    if (tone <= 8) return "Polite & Professional";
    return "Formal & Obsequious";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Manage game-wide parameters and settings. (Administrator Only)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Game Settings</CardTitle>
          <CardDescription>Adjust core game parameters and feature flags.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <Card className="p-4 border-dashed">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                <h3 className="text-lg font-semibold">Force Daily Game Reset</h3>
                <p className="text-sm text-muted-foreground">
                  Allows all users to play today's puzzle again, bypassing the once-a-day limit.
                  This takes effect when users next load the game page.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="mt-2 sm:mt-0 shrink-0" disabled={isResetting}>
                    {isResetting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Trigger Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will allow all users to play today's game again. This action cannot be easily undone for individual users once they refresh the game.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleForceDailyReset} disabled={isResetting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      {isResetting ? 'Resetting...' : 'Yes, Trigger Reset'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>

          <Card className="p-4 border-dashed">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">UI Friendliness Tone</h3>
              <p className="text-sm text-muted-foreground">
                Adjust the overall tone of system messages and AI interactions.
                Scale: 1 (Jovial) to 10 (Formal).
              </p>
              {isLoadingSettings ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading tone setting...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Smile className="h-6 w-6 text-primary" />
                    <Slider
                      id="uiTone"
                      min={1}
                      max={10}
                      step={1}
                      value={[uiTone]}
                      onValueChange={(value) => setUiTone(value[0])}
                      className="flex-grow"
                      disabled={isSavingTone}
                    />
                    <span className="font-mono text-lg w-8 text-center">{uiTone}</span>
                  </div>
                  <p className="text-sm text-center text-accent font-medium">{getToneDescription(uiTone)}</p>
                  <Button onClick={handleSaveUiTone} disabled={isSavingTone} className="w-full sm:w-auto">
                    {isSavingTone ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Tone Setting
                  </Button>
                </div>
              )}
            </div>
          </Card>

        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
              Changes to settings might require users to refresh or revisit for full effect.
            </p>
          </CardFooter>
      </Card>
    </div>
  );
}

    