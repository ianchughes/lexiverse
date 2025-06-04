
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { UserSuggestionLog, UserSuggestionStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { adminUpdateSuggestionStatusAction } from './actions';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Archive, CheckSquare, Lightbulb, MessageSquare, User, Calendar, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';

const SUGGESTIONS_PER_PAGE = 10; // Example pagination, can be adjusted

export default function SuggestionManagementPage() {
  const { toast } = useToast();
  const { currentUser: actingAdmin } = useAuth();
  const [pendingSuggestions, setPendingSuggestions] = useState<UserSuggestionLog[]>([]);
  const [archivedSuggestions, setArchivedSuggestions] = useState<UserSuggestionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedSuggestion, setSelectedSuggestion] = useState<UserSuggestionLog | null>(null);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'Actioned' | 'Archived_NoAction' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const suggestionsQuery = query(collection(firestore, "UserSuggestions"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(suggestionsQuery);
      const allSuggestions: UserSuggestionLog[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserSuggestionLog));
      
      setPendingSuggestions(allSuggestions.filter(s => s.status === 'Pending'));
      setArchivedSuggestions(allSuggestions.filter(s => s.status === 'Actioned' || s.status === 'Archived_NoAction'));

    } catch (error) {
      console.error("Error fetching suggestions:", error);
      toast({ title: "Error", description: "Could not fetch suggestions.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const openActionDialog = (suggestion: UserSuggestionLog, type: 'Actioned' | 'Archived_NoAction') => {
    setSelectedSuggestion(suggestion);
    setActionType(type);
    setAdminNotes(suggestion.adminNotes || '');
    setIsActionDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedSuggestion || !actionType || !actingAdmin) return;
    setIsProcessingAction(true);
    try {
      const result = await adminUpdateSuggestionStatusAction({
        suggestionId: selectedSuggestion.id!,
        newStatus: actionType,
        adminNotes: adminNotes,
        actingAdminId: actingAdmin.uid,
      });
      if (result.success) {
        toast({ title: "Suggestion Updated", description: `Suggestion marked as ${actionType}.` });
        fetchSuggestions(); // Refresh list
        setIsActionDialogOpen(false);
      } else {
        throw new Error(result.error || "Failed to update suggestion.");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const formatDateSafe = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'N/A';
    return format(timestamp.toDate(), 'PP p');
  };

  const SuggestionCard = ({ suggestion, onAction }: { suggestion: UserSuggestionLog, onAction: (suggestion: UserSuggestionLog, type: 'Actioned' | 'Archived_NoAction') => void }) => (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Suggestion from {suggestion.username || (suggestion.userId ? `User (${suggestion.userId.substring(0,6)}...)` : 'Anonymous')}
        </CardTitle>
        <CardDescription className="text-xs flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Submitted: {formatDateSafe(suggestion.timestamp)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p><strong className="font-medium text-foreground">User's Suggestion:</strong> {suggestion.suggestionText}</p>
        <p className="text-sm"><strong className="font-medium text-muted-foreground">Bot's Initial Response:</strong> {suggestion.botResponse}</p>
        {suggestion.status !== 'Pending' && (
            <div className="pt-2 mt-2 border-t border-border">
                <p className="text-sm font-semibold text-accent">
                    Status: {suggestion.status} (by Admin ID: {suggestion.actionedByAdminId?.substring(0,6)}...)
                </p>
                <p className="text-xs text-muted-foreground">Date Actioned: {formatDateSafe(suggestion.dateActioned)}</p>
                {suggestion.adminNotes && <p className="text-xs text-muted-foreground mt-1">Admin Notes: {suggestion.adminNotes}</p>}
            </div>
        )}
      </CardContent>
      {suggestion.status === 'Pending' && (
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onAction(suggestion, 'Archived_NoAction')}>
            <Archive className="mr-2 h-4 w-4" /> Archive (No Action)
          </Button>
          <Button size="sm" onClick={() => onAction(suggestion, 'Actioned')} className="bg-green-600 hover:bg-green-700 text-white">
            <CheckSquare className="mr-2 h-4 w-4" /> Mark Actioned
          </Button>
        </CardFooter>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Lightbulb className="h-8 w-8 text-primary" /> User Suggestions
            </h1>
            <p className="text-muted-foreground mt-1">
            Review and manage feedback submitted by players.
            </p>
        </div>
        <Button onClick={fetchSuggestions} variant="outline" size="icon" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">Pending ({pendingSuggestions.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedSuggestions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading pending suggestions...</p></div>
          ) : pendingSuggestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No pending suggestions. All caught up!</p>
          ) : (
            <ScrollArea className="h-[calc(100vh-20rem)] pr-3"> {/* Adjust height as needed */}
                <div className="space-y-4">
                    {pendingSuggestions.map(s => <SuggestionCard key={s.id} suggestion={s} onAction={openActionDialog} />)}
                </div>
            </ScrollArea>
          )}
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading archived suggestions...</p></div>
          ) : archivedSuggestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No archived suggestions yet.</p>
          ) : (
             <ScrollArea className="h-[calc(100vh-20rem)] pr-3"> {/* Adjust height as needed */}
                <div className="space-y-4">
                    {archivedSuggestions.map(s => <SuggestionCard key={s.id} suggestion={s} onAction={openActionDialog} />)}
                </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Suggestion: {actionType}</DialogTitle>
            <DialogDescription>
              Add any notes for this action. Original Suggestion: "{selectedSuggestion?.suggestionText.substring(0, 100)}..."
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="adminNotes">Admin Notes (Optional)</Label>
            <Textarea 
              id="adminNotes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="e.g., Good idea, added to backlog. or Not feasible at this time."
              disabled={isProcessingAction}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsActionDialogOpen(false)} disabled={isProcessingAction}>Cancel</Button>
            <Button onClick={handleConfirmAction} disabled={isProcessingAction}>
              {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm {actionType}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

    