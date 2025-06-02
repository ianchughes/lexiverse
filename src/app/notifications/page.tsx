
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import type { AppNotification, CircleInvite } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, BellRing, Check, X, AlertTriangle } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { respondToCircleInviteAction } from '@/app/circles/actions';
import { useToast } from '@/hooks/use-toast';

export default function NotificationsPage() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);


  const fetchNotifications = useCallback(async () => {
    if (isLoadingAuth || !currentUser) {
      if (!isLoadingAuth && !currentUser) setIsLoadingNotifications(false);
      return;
    }
    setIsLoadingNotifications(true);
    setError(null);
    try {
      // Fetch AppNotifications (generic notifications)
      const genericNotifsQuery = query(
        collection(firestore, 'Notifications'),
        where('userId', '==', currentUser.uid),
        orderBy('dateCreated', 'desc')
      );
      const genericNotifsSnap = await getDocs(genericNotifsQuery);
      const fetchedGenericNotifs = genericNotifsSnap.docs.map(d => ({ ...d.data(), id: d.id } as AppNotification));
      
      // Fetch CircleInvites and transform them into AppNotification format for display
      const circleInvitesQuery = query(
        collection(firestore, 'CircleInvites'),
        where('inviteeUserId', '==', currentUser.uid),
        where('status', '==', 'Sent'), // Only show pending invites
        orderBy('dateSent', 'desc')
      );
      const circleInvitesSnap = await getDocs(circleInvitesQuery);
      const fetchedCircleInvitesAsNotifs: AppNotification[] = circleInvitesSnap.docs.map(d => {
        const invite = d.data() as CircleInvite;
        return {
          id: d.id, // Use invite ID as notification ID
          userId: invite.inviteeUserId,
          message: `${invite.inviterUsername} invited you to join "${invite.circleName}".`,
          type: 'CircleInvite',
          relatedEntityId: invite.circleId, // Store circleId for linking
          isRead: false, // Invites are actionable, not just "read"
          dateCreated: invite.dateSent,
          link: `/circles/${invite.circleId}` // Optional link to view circle before accepting
        };
      });

      // Combine and sort (if necessary, though separate queries are ordered)
      // For now, just prepend invites
      const combinedNotifications = [...fetchedCircleInvitesAsNotifs, ...fetchedGenericNotifs];
      // Simple sort by date again after combining if types are mixed up.
      combinedNotifications.sort((a,b) => b.dateCreated.toMillis() - a.dateCreated.toMillis());

      setNotifications(combinedNotifications);

    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError("Could not load notifications. Please try again later.");
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [currentUser, isLoadingAuth]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleInviteResponse = async (inviteId: string, response: 'Accepted' | 'Declined') => {
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
        toast({ title: `Invite ${response}`, description: `You have ${response.toLowerCase()} the invitation.` });
        fetchNotifications(); // Re-fetch to remove/update the invite
      } else {
        throw new Error(result.error || `Failed to ${response.toLowerCase()} invite.`);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingInviteId(null);
    }
  };
  
  const markAsRead = async (notificationId: string) => {
    // For generic notifications, mark as read
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

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight flex items-center">
        <BellRing className="mr-3 h-8 w-8 text-primary" /> Notifications
      </h1>
      {notifications.length === 0 ? (
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
          <Card key={notif.id} className={`transition-opacity ${notif.isRead && notif.type !== 'CircleInvite' ? 'opacity-60' : ''}`}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="flex-grow">
                <p className="text-sm font-medium">{notif.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNowStrict(notif.dateCreated.toDate())} ago
                </p>
                {notif.link && notif.type !== 'CircleInvite' && (
                  <Button variant="link" size="sm" asChild className="p-0 h-auto mt-1">
                    <Link href={notif.link}>View Details</Link>
                  </Button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center shrink-0">
                {notif.type === 'CircleInvite' ? (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleInviteResponse(notif.id!, 'Declined')}
                      disabled={processingInviteId === notif.id}
                      className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {processingInviteId === notif.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      <X className="mr-1 h-3 w-3" /> Decline
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleInviteResponse(notif.id!, 'Accepted')}
                      disabled={processingInviteId === notif.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingInviteId === notif.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      <Check className="mr-1 h-3 w-3" /> Accept
                    </Button>
                  </>
                ) : (
                  !notif.isRead && (
                     <Button variant="ghost" size="sm" onClick={() => markAsRead(notif.id!)}>Mark as Read</Button>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
