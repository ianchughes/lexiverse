
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import type { AppNotification, CircleInvite, WordTransfer } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, BellRing, Check, X, AlertTriangle, SendHorizontal, Gift } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { respondToCircleInviteAction } from '@/app/circles/actions';
import { respondToWordTransferAction } from '@/app/word-actions';
import { useToast } from '@/hooks/use-toast';

export default function NotificationsPage() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);


  const fetchNotifications = useCallback(async () => {
    if (isLoadingAuth || !currentUser) {
      if (!isLoadingAuth && !currentUser) setIsLoadingNotifications(false);
      return;
    }
    setIsLoadingNotifications(true);
    setError(null);

    let fetchedGenericNotifs: AppNotification[] = [];
    let fetchedCircleInvitesAsNotifs: AppNotification[] = [];
    let fetchedWordTransfersAsNotifs: AppNotification[] = [];
    let anErrorOccurred = false;

    // Fetch Generic Notifications
    try {
      const genericNotifsQuery = query(
        collection(firestore, 'Notifications'),
        where('userId', '==', currentUser.uid),
        orderBy('dateCreated', 'desc')
      );
      const genericNotifsSnap = await getDocs(genericNotifsQuery);
      fetchedGenericNotifs = genericNotifsSnap.docs.map(d => ({ ...d.data(), id: d.id } as AppNotification))
        .filter(notif => notif.type !== 'CircleInvite' && notif.type !== 'WordTransferRequest');
    } catch (err: any) {
      console.error("Error fetching generic notifications:", err);
      anErrorOccurred = true;
    }

    // Fetch Circle Invites
    try {
      const circleInvitesQuery = query(
        collection(firestore, 'CircleInvites'),
        where('inviteeUserId', '==', currentUser.uid),
        where('status', '==', 'Sent'),
        orderBy('dateSent', 'desc')
      );
      const circleInvitesSnap = await getDocs(circleInvitesQuery);
      fetchedCircleInvitesAsNotifs = circleInvitesSnap.docs.map(d => {
        const invite = d.data() as CircleInvite;
        return {
          id: d.id,
          userId: invite.inviteeUserId!,
          message: `${invite.inviterUsername} invited you to join circle "${invite.circleName}".`,
          type: 'CircleInvite',
          relatedEntityId: invite.circleId,
          isRead: false,
          dateCreated: invite.dateSent,
          link: `/circles/${invite.circleId}`
        };
      });
    } catch (err: any) {
      console.error("Error fetching circle invites:", err);
      anErrorOccurred = true;
    }

    // Fetch Word Transfer Requests
    try {
      const wordTransferRequestsQuery = query(
        collection(firestore, 'WordTransfers'),
        where('recipientUserId', '==', currentUser.uid),
        where('status', '==', 'PendingRecipient'),
        orderBy('initiatedAt', 'desc')
      );
      const wordTransferRequestsSnap = await getDocs(wordTransferRequestsQuery);
      fetchedWordTransfersAsNotifs = wordTransferRequestsSnap.docs.map(d => {
        const transfer = d.data() as WordTransfer;
        return {
          id: d.id,
          userId: transfer.recipientUserId,
          message: `${transfer.senderUsername} wants to transfer ownership of the word "${transfer.wordText}" to you.`,
          type: 'WordTransferRequest',
          relatedEntityId: d.id,
          isRead: false,
          dateCreated: transfer.initiatedAt,
        };
      });
    } catch (err: any) {
      console.error("Error fetching word transfer requests:", err);
      anErrorOccurred = true;
    }

    const combinedNotifications = [...fetchedGenericNotifs, ...fetchedCircleInvitesAsNotifs, ...fetchedWordTransfersAsNotifs];
    
    if (anErrorOccurred && combinedNotifications.length === 0) {
      setError("Could not load notifications. Please try again later.");
    } else if (anErrorOccurred) {
        toast({
            title: "Partial Notifications",
            description: "Some notifications might be missing. Displaying what we could fetch.",
            variant: "default"
        });
    }

    combinedNotifications.sort((a, b) => {
        const timeA = a.dateCreated?.toMillis() || 0;
        const timeB = b.dateCreated?.toMillis() || 0;
        return timeB - timeA;
    });

    setNotifications(combinedNotifications);
    setIsLoadingNotifications(false);

  }, [currentUser, isLoadingAuth, toast]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleCircleInviteResponse = async (inviteId: string, response: 'Accepted' | 'Declined') => {
    if (!currentUser || !userProfile) return;
    setProcessingInviteId(inviteId);
    try {
      const result = await respondToCircleInviteAction({
        inviteId: inviteId,
        inviteeUserId: currentUser.uid,
        inviteeUsername: userProfile.username,
        responseType: response,
      });
      if (result.success) {
        toast({ title: `Circle Invite ${response}`, description: `You have ${response.toLowerCase()} the circle invitation.` });
        fetchNotifications(); 
      } else {
        throw new Error(result.error || `Failed to ${response.toLowerCase()} circle invite.`);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleWordTransferResponse = async (transferId: string, response: 'Accepted' | 'Declined') => {
    if (!currentUser) return;
    setProcessingTransferId(transferId);
    try {
      const result = await respondToWordTransferAction({
        transferId: transferId,
        respondingUserId: currentUser.uid,
        response: response,
      });
      if (result.success) {
        toast({ title: `Word Transfer ${response}`, description: `You have ${response.toLowerCase()} the word transfer.` });
        fetchNotifications(); 
      } else {
        throw new Error(result.error || `Failed to ${response.toLowerCase()} word transfer.`);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingTransferId(null);
    }
  };
  
  const markAsRead = async (notificationId: string, type: AppNotification['type']) => {
    if (type === 'CircleInvite' || type === 'WordTransferRequest') return; 

    const notifRef = doc(firestore, "Notifications", notificationId);
    try {
      await updateDoc(notifRef, { isRead: true });
      setNotifications(prev => prev.map(n => n.id === notificationId ? {...n, isRead: true} : n));
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast({title: "Error", description: "Could not mark as read.", variant: "destructive"});
    }
  };


  if (isLoadingAuth || isLoadingNotifications) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!currentUser) {
     return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">You need to be logged in to view notifications.</p>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
      </div>
    );
  }

  if (error && notifications.length === 0) { // Only show full error if nothing loaded
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight flex items-center">
        <BellRing className="mr-3 h-8 w-8 text-primary" /> Notifications
      </h1>
      {notifications.length === 0 && !error ? ( // Added !error here
        <Card className="text-center py-10">
          <CardHeader>
            <CardTitle className="text-xl">No New Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>You're all caught up!</CardDescription>
          </CardContent>
        </Card>
      ) : (
        notifications.map(notif => (
          <Card key={notif.id} className={`transition-opacity ${notif.isRead && notif.type !== 'CircleInvite' && notif.type !== 'WordTransferRequest' ? 'opacity-60' : ''}`}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="flex-grow">
                <p className="text-sm font-medium">{notif.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {notif.dateCreated ? formatDistanceToNowStrict(notif.dateCreated.toDate()) : 'Recently'} ago
                   {notif.type === 'WordTransferRequest' && (
                    <span className="text-accent"> (Expires in ~24 hours)</span>
                  )}
                </p>
                {notif.link && notif.type !== 'CircleInvite' && notif.type !== 'WordTransferRequest' && (
                  <Button variant="link" size="sm" asChild className="p-0 h-auto mt-1">
                    <Link href={notif.link}>View Details</Link>
                  </Button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center shrink-0">
                {notif.type === 'CircleInvite' && notif.id && (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCircleInviteResponse(notif.id!, 'Declined')}
                      disabled={processingInviteId === notif.id}
                      className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {processingInviteId === notif.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      <X className="mr-1 h-3 w-3" /> Decline Circle
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleCircleInviteResponse(notif.id!, 'Accepted')}
                      disabled={processingInviteId === notif.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingInviteId === notif.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      <Check className="mr-1 h-3 w-3" /> Accept Circle
                    </Button>
                  </>
                )}
                {notif.type === 'WordTransferRequest' && notif.id && (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleWordTransferResponse(notif.id!, 'Declined')}
                      disabled={processingTransferId === notif.id}
                      className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {processingTransferId === notif.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      <X className="mr-1 h-3 w-3" /> Decline Word
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleWordTransferResponse(notif.id!, 'Accepted')}
                      disabled={processingTransferId === notif.id}
                      className="bg-accent hover:bg-accent/90 text-accent-foreground"
                    >
                      {processingTransferId === notif.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      <Gift className="mr-1 h-3 w-3" /> Accept Word
                    </Button>
                  </>
                )}
                {notif.type !== 'CircleInvite' && notif.type !== 'WordTransferRequest' && !notif.isRead && (
                     <Button variant="ghost" size="sm" onClick={() => markAsRead(notif.id!, notif.type)}>Mark as Read</Button>
                  )
                }
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
