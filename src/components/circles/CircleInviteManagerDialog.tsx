
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { CircleInvite } from '@/types';
import { Loader2, Trash2, Send, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { userDeleteCircleInviteAction, userResendCircleInviteAction } from '@/app/circles/actions';
import { useAuth } from '@/contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


interface CircleInviteManagerDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  circleId: string | null;
  circleName: string | null;
}

export function CircleInviteManagerDialog({ isOpen, onOpenChange, circleId, circleName }: CircleInviteManagerDialogProps) {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [pendingInvites, setPendingInvites] = useState<CircleInvite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  
  const [inviteToDelete, setInviteToDelete] = useState<CircleInvite | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);


  const fetchPendingInvites = useCallback(async () => {
    if (!circleId || !currentUser) return;
    setIsLoadingInvites(true);
    try {
      const q = query(
        collection(firestore, 'CircleInvites'),
        where('circleId', '==', circleId),
        where('status', 'in', ['Sent', 'SentToEmail']),
        orderBy('dateSent', 'desc')
      );
      const invitesSnap = await getDocs(q);
      setPendingInvites(invitesSnap.docs.map(d => ({ ...d.data(), id: d.id } as CircleInvite)));
    } catch (error) {
      console.error("Error fetching pending invites:", error);
      toast({ title: "Error", description: "Could not load pending invites.", variant: "destructive" });
    } finally {
      setIsLoadingInvites(false);
    }
  }, [circleId, currentUser, toast]);

  useEffect(() => {
    if (isOpen && circleId) {
      fetchPendingInvites();
    } else {
      setPendingInvites([]); // Clear invites when dialog closes or circleId is null
    }
  }, [isOpen, circleId, fetchPendingInvites]);

  const handleDeleteInvite = async () => {
    if (!inviteToDelete || !currentUser || !circleId) return;
    setProcessingInviteId(inviteToDelete.id!);
    try {
      const result = await userDeleteCircleInviteAction({
        inviteId: inviteToDelete.id!,
        requestingUserId: currentUser.uid,
        circleId: circleId,
      });
      if (result.success) {
        toast({ title: "Invite Deleted", description: `Invitation to ${inviteToDelete.inviteeUsername || inviteToDelete.inviteeEmail} has been deleted.` });
        fetchPendingInvites(); // Refresh list
      } else {
        throw new Error(result.error || "Failed to delete invite.");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingInviteId(null);
      setIsDeleteConfirmOpen(false);
      setInviteToDelete(null);
    }
  };

  const handleResendInvite = async (invite: CircleInvite) => {
    if (!currentUser || !circleId) return;
    setProcessingInviteId(invite.id!);
    try {
      const result = await userResendCircleInviteAction({
        inviteId: invite.id!,
        requestingUserId: currentUser.uid,
        circleId: circleId,
      });
      if (result.success) {
        toast({ title: "Reminder Sent", description: `Reminder sent for invite to ${invite.inviteeUsername || invite.inviteeEmail}.` });
        fetchPendingInvites(); // Refresh to show updated timestamp
      } else {
        throw new Error(result.error || "Failed to resend invite.");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const openDeleteConfirm = (invite: CircleInvite) => {
    setInviteToDelete(invite);
    setIsDeleteConfirmOpen(true);
  };
  
  const formatDateSafe = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return format(timestamp.toDate(), 'PP p');
  }
  const formatDistanceSafe = (timestamp?: Timestamp) => {
     if (!timestamp) return 'Never';
     return formatDistanceToNowStrict(timestamp.toDate(), { addSuffix: true });
  }


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Pending Invites for "{circleName || 'Circle'}"</DialogTitle>
          <DialogDescription>
            View, resend, or delete pending invitations for this circle.
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-4">
            <Button onClick={fetchPendingInvites} variant="outline" size="sm" disabled={isLoadingInvites}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingInvites ? 'animate-spin' : ''}`} />
                Refresh Invites
            </Button>
        </div>

        {isLoadingInvites ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : pendingInvites.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No pending invitations for this circle.</p>
        ) : (
          <ScrollArea className="h-[300px] md:h-[400px] border rounded-md p-2">
            <div className="space-y-3">
              {pendingInvites.map(invite => (
                <div key={invite.id} className="p-3 bg-muted/30 rounded-md shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                      <p className="font-medium text-primary">
                        To: {invite.inviteeUsername || invite.inviteeEmail || 'Unknown Invitee'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sent: {formatDateSafe(invite.dateSent)}
                      </p>
                       <p className="text-xs text-muted-foreground">
                        Status: {invite.status}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last Reminder: {formatDistanceSafe(invite.lastReminderSentTimestamp)}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleResendInvite(invite)}
                        disabled={processingInviteId === invite.id}
                        className="text-blue-600 border-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {processingInviteId === invite.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Send className="mr-1 h-3 w-3" />}
                        Resend
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => openDeleteConfirm(invite)}
                        disabled={processingInviteId === invite.id}
                        className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                         {processingInviteId === invite.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Trash2 className="mr-1 h-3 w-3" />}
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>

      {inviteToDelete && (
        <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Delete Invite</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the invitation to "{inviteToDelete.inviteeUsername || inviteToDelete.inviteeEmail}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processingInviteId === inviteToDelete.id} onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteInvite} disabled={processingInviteId === inviteToDelete.id} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {processingInviteId === inviteToDelete.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}

    