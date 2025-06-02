
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { firestore } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, Zap } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { SystemSettings } from '@/types';

const SYSTEM_SETTINGS_COLLECTION = "SystemConfiguration";
const GAME_SETTINGS_DOC_ID = "gameSettings";

export default function SystemConfigurationPage() {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);

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
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Interface for administrators to configure global game settings will be implemented here.
            Current settings involve daily play reset.
          </p>
          
          <div className="space-y-4">
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
                    <Button variant="destructive" className="mt-2 sm:mt-0" disabled={isResetting}>
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
            {/* Future game settings can be added here */}
          </div>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
              More global game settings (e.g., feature flags, maintenance mode) can be added here.
            </p>
          </CardFooter>
      </Card>
    </div>
  );
}
