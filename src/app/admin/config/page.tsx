
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { adminForceDailyResetAction } from './actions';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


export default function SystemConfigurationPage() {
  const { toast } = useToast();
  const { currentUser: actingAdmin } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');

  const handleForceDailyReset = async () => {
    if (!actingAdmin) {
      toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive"});
      return;
    }
    if (confirmationInput !== "reset") {
      toast({ title: "Confirmation Failed", description: "You must type 'reset' to confirm.", variant: "destructive"});
      return;
    }

    setIsResetting(true);
    try {
      const result = await adminForceDailyResetAction({ actingAdminId: actingAdmin.uid });
      if (result.success) {
        toast({
          title: "Daily Reset Triggered",
          description: "The daily game play limit has been reset. Users will be able to play again on their next visit/refresh.",
        });
        setIsConfirmDialogOpen(false); // Close dialog on success
        setConfirmationInput(''); // Clear input
      } else {
        throw new Error(result.error || "Could not trigger daily reset.");
      }
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
          <CardDescription>Adjust core game parameters.</CardDescription>
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
              <AlertDialog open={isConfirmDialogOpen} onOpenChange={(open) => {
                setIsConfirmDialogOpen(open);
                if (!open) setConfirmationInput(''); // Clear input if dialog is closed
              }}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    className="mt-2 sm:mt-0 shrink-0" 
                    disabled={isResetting || !actingAdmin}
                    onClick={() => setIsConfirmDialogOpen(true)}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Trigger Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will allow all users to play today's game again. This action cannot be easily undone for individual users once they refresh the game.
                      <br />
                      To confirm, please type "<strong>reset</strong>" in the box below.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-2">
                    <Label htmlFor="reset-confirm-input" className="sr-only">Type 'reset' to confirm</Label>
                    <Input 
                      id="reset-confirm-input"
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                      placeholder='Type "reset" here'
                      disabled={isResetting}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel 
                      onClick={() => { setIsConfirmDialogOpen(false); setConfirmationInput(''); }} 
                      disabled={isResetting}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleForceDailyReset} 
                      disabled={isResetting || confirmationInput !== "reset"} 
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      {isResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {isResetting ? 'Resetting...' : 'Confirm Reset'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
