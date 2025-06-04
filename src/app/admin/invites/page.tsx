
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase'; // auth removed
import { collection, getDocs, Timestamp, query, orderBy } from 'firebase/firestore'; // serverTimestamp, doc, updateDoc, deleteDoc removed
import type { CircleInvite, CircleInviteStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreHorizontal, Trash2, Send, BellRing, Loader2, RefreshCw, History, XCircle } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { adminDeleteCircleInviteAction, adminUpdateCircleInviteStatusAction, adminSendCircleInviteReminderAction } from './actions';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth


export default function CircleInviteManagementPage() {
  const { toast } = useToast();
  const { currentUser: actingAdmin } = useAuth(); // Get current admin
  const [invites, setInvites] = useState<CircleInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CircleInviteStatus | 'all'>('all');
  
  const [inviteToProcess, setInviteToProcess] = useState<CircleInvite | null>(null);
  const [actionType, setActionType] = useState<'delete' | 'updateStatus' | 'sendReminder' | null>(null);
  const [newStatusForInvite, setNewStatusForInvite] = useState<CircleInviteStatus | null>(null);
  const [isActionConfirmOpen, setIsActionConfirmOpen] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchInvites = useCallback(async () => {
    setIsLoading(true);
    try {
      let q = query(collection(firestore, "CircleInvites"), orderBy("dateSent", "desc"));
      
      const querySnapshot = await getDocs(q);
      let fetchedInvites: CircleInvite[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CircleInvite));

      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        fetchedInvites = fetchedInvites.filter(invite => 
          invite.circleName.toLowerCase().includes(lowerSearchTerm) ||
          invite.inviterUsername.toLowerCase().includes(lowerSearchTerm) ||
          (invite.inviteeUsername && invite.inviteeUsername.toLowerCase().includes(lowerSearchTerm)) ||
          (invite.inviteeEmail && invite.inviteeEmail.toLowerCase().includes(lowerSearchTerm)) ||
          (invite.id && invite.id.toLowerCase().includes(lowerSearchTerm))
        );
      }
      if (statusFilter !== 'all') {
        fetchedInvites = fetchedInvites.filter(invite => invite.status === statusFilter);
      }
      
      setInvites(fetchedInvites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      toast({ title: "Error", description: "Could not fetch circle invites.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, searchTerm, statusFilter]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const getStatusBadge = (status: CircleInviteStatus) => {
    switch (status) {
      case 'Sent': return <Badge className="bg-blue-500 hover:bg-blue-600">Sent (In-App)</Badge>;
      case 'SentToEmail': return <Badge className="bg-sky-500 hover:bg-sky-600">Sent (To Email)</Badge>;
      case 'Accepted': return <Badge className="bg-green-500 hover:bg-green-600">Accepted</Badge>;
      case 'Declined': return <Badge variant="destructive">Declined</Badge>;
      case 'Expired': return <Badge variant="secondary">Expired</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openActionConfirmDialog = (invite: CircleInvite, type: 'delete' | 'updateStatus' | 'sendReminder', newStatus?: CircleInviteStatus) => {
    setInviteToProcess(invite);
    setActionType(type);
    if (type === 'updateStatus' && newStatus) setNewStatusForInvite(newStatus);
    setIsActionConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!inviteToProcess || !actionType || !actingAdmin) {
      toast({ title: "Error", description: "Required information missing or admin not authenticated.", variant: "destructive" });
      return;
    }
    
    setIsProcessingAction(true);
    let result: { success: boolean; error?: string } = { success: false, error: "Unknown action type." };
    const inviteeIdentifier = inviteToProcess.inviteeUsername || inviteToProcess.inviteeEmail || 'Unknown';

    try {
      if (actionType === 'delete') {
        result = await adminDeleteCircleInviteAction({ 
            inviteId: inviteToProcess.id!, 
            actingAdminId: actingAdmin.uid,
            inviteeIdentifier: inviteeIdentifier,
            circleName: inviteToProcess.circleName,
        });
      } else if (actionType === 'updateStatus' && newStatusForInvite) {
        result = await adminUpdateCircleInviteStatusAction({ 
            inviteId: inviteToProcess.id!, 
            newStatus: newStatusForInvite, 
            adminNotes: "Status updated by admin.", 
            actingAdminId: actingAdmin.uid,
            inviteeIdentifier: inviteeIdentifier,
            circleName: inviteToProcess.circleName,
        });
      } else if (actionType === 'sendReminder') {
        result = await adminSendCircleInviteReminderAction({ 
            inviteId: inviteToProcess.id!,
            actingAdminId: actingAdmin.uid,
            inviteeIdentifier: inviteeIdentifier,
            circleName: inviteToProcess.circleName,
        });
      }

      if (result.success) {
        toast({ title: "Action Successful", description: `Invite action "${actionType}" completed for invite to "${inviteeIdentifier}" for circle "${inviteToProcess.circleName}".` });
        fetchInvites(); 
      } else {
        throw new Error(result.error || "Failed to perform action.");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessingAction(false);
      setIsActionConfirmOpen(false);
      setInviteToProcess(null);
      setActionType(null);
      setNewStatusForInvite(null);
    }
  };

  const formatDateSafe = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'N/A';
    return format(timestamp.toDate(), 'PP p');
  }
  const formatDistanceSafe = (timestamp?: Timestamp) => {
    if (!timestamp) return 'Never';
    return formatDistanceToNowStrict(timestamp.toDate(), { addSuffix: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Circle Invite Management</h1>
        <p className="text-muted-foreground mt-1">
          Oversee all circle invitations sent within Lexiverse.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>All Invites</CardTitle>
              <CardDescription>View, filter, and manage circle invitations.</CardDescription>
            </div>
            <Button onClick={fetchInvites} variant="outline" size="icon" disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
           <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Input 
              placeholder="Search by Circle, Inviter, Invitee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CircleInviteStatus | 'all')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Sent">Sent (In-App)</SelectItem>
                <SelectItem value="SentToEmail">Sent (To Email)</SelectItem>
                <SelectItem value="Accepted">Accepted</SelectItem>
                <SelectItem value="Declined">Declined</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading invites...</p>
            </div>
          ) : invites.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">
              No invites found{searchTerm || statusFilter !== 'all' ? ' matching your filters' : ''}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Circle Name</TableHead>
                  <TableHead>Inviter</TableHead>
                  <TableHead>Invitee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Sent</TableHead>
                  <TableHead>Date Responded</TableHead>
                  <TableHead>Last Reminder</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium text-primary">{invite.circleName}</TableCell>
                    <TableCell>
                        {invite.inviterUsername}
                        <div className="text-xs text-muted-foreground font-mono" title={invite.inviterUserId}>{invite.inviterUserId.substring(0,8)}...</div>
                    </TableCell>
                    <TableCell>
                      {invite.inviteeUsername || invite.inviteeEmail || 'N/A'}
                      {(invite.inviteeUserId) && <div className="text-xs text-muted-foreground font-mono" title={invite.inviteeUserId}>{invite.inviteeUserId.substring(0,8)}...</div>}
                    </TableCell>
                    <TableCell>{getStatusBadge(invite.status)}</TableCell>
                    <TableCell>{formatDateSafe(invite.dateSent)}</TableCell>
                    <TableCell>{formatDateSafe(invite.dateResponded)}</TableCell>
                    <TableCell>{formatDistanceSafe(invite.lastReminderSentTimestamp)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isProcessingAction && inviteToProcess?.id === invite.id}>
                            {isProcessingAction && inviteToProcess?.id === invite.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions for Invite</DropdownMenuLabel>
                           <DropdownMenuItem onClick={() => openActionConfirmDialog(invite, 'sendReminder')} disabled={(invite.status !== 'Sent' && invite.status !== 'SentToEmail') || (isProcessingAction && inviteToProcess?.id === invite.id)}>
                            <BellRing className="mr-2 h-4 w-4 text-blue-500"/>Send Reminder
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openActionConfirmDialog(invite, 'updateStatus', 'Expired')} disabled={invite.status === 'Expired' || invite.status === 'Accepted' || invite.status === 'Declined' || (isProcessingAction && inviteToProcess?.id === invite.id)}>
                            <XCircle className="mr-2 h-4 w-4 text-orange-500"/>Mark as Expired
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openActionConfirmDialog(invite, 'delete')} className="text-destructive focus:text-destructive" disabled={isProcessingAction && inviteToProcess?.id === invite.id}>
                            <Trash2 className="mr-2 h-4 w-4"/>Delete Invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">Displaying {invites.length} invites.</p>
        </CardFooter>
      </Card>

      {inviteToProcess && (
        <AlertDialog open={isActionConfirmOpen} onOpenChange={setIsActionConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Action: {actionType?.replace(/([A-Z])/g, ' $1').trim()}</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to {actionType} this invite
                {actionType === 'updateStatus' && ` for "${inviteToProcess.inviteeUsername || inviteToProcess.inviteeEmail}" to circle "${inviteToProcess.circleName}" and set its status to "${newStatusForInvite}"`}
                {actionType === 'sendReminder' && ` for "${inviteToProcess.inviteeUsername || inviteToProcess.inviteeEmail}" to circle "${inviteToProcess.circleName}"? This will log a reminder event and update the timestamp.`}
                {actionType === 'delete' && ` for "${inviteToProcess.inviteeUsername || inviteToProcess.inviteeEmail}" to circle "${inviteToProcess.circleName}"? This action cannot be undone.`}
                ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessingAction} onClick={() => setIsActionConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConfirmAction} 
                disabled={isProcessingAction} 
                className={actionType === 'delete' ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}>
                {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Action
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
