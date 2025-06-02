
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc } from 'firebase/firestore';
import type { WordSubmission, WordSubmissionStatus, MasterWord, UserProfile } from '@/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, FileX2, ShieldAlert, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from 'date-fns';


const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const USERS_COLLECTION = "Users";

export default function WordManagementPage() {
  const { toast } = useToast();
  const [pendingSubmissions, setPendingSubmissions] = useState<WordSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [submissionToApprove, setSubmissionToApprove] = useState<WordSubmission | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [pointsForApproval, setPointsForApproval] = useState<number>(0);
  const [notesForApproval, setNotesForApproval] = useState<string>('');
  
  const [submissionToReject, setSubmissionToReject] = useState<WordSubmission | null>(null);
  const [rejectActionType, setRejectActionType] = useState<WordSubmissionStatus | null>(null);
  const [isRejectConfirmDialogOpen, setIsRejectConfirmDialogOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);


  const fetchPendingSubmissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = query(collection(firestore, WORD_SUBMISSIONS_QUEUE), where("status", "==", "PendingModeratorReview"));
      const querySnapshot = await getDocs(q);
      const submissions: WordSubmission[] = [];
      querySnapshot.forEach((docSnap) => {
        submissions.push({ id: docSnap.id, ...docSnap.data() } as WordSubmission);
      });
      submissions.sort((a, b) => {
        const tsA = a.submittedTimestamp as Timestamp;
        const tsB = b.submittedTimestamp as Timestamp;
        return tsA.toMillis() - tsB.toMillis(); // Oldest first
      });
      setPendingSubmissions(submissions);
    } catch (error) {
      console.error("Error fetching pending submissions:", error);
      toast({ title: "Error", description: "Could not fetch pending word submissions.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingSubmissions();
  }, [fetchPendingSubmissions]);

  const openApproveDialog = (submission: WordSubmission) => {
    setSubmissionToApprove(submission);
    setPointsForApproval(submission.wordText.length * 10); // Default points suggestion
    setNotesForApproval('');
    setIsApproveDialogOpen(true);
  };

  const openRejectConfirmDialog = (submission: WordSubmission, actionType: WordSubmissionStatus) => {
    setSubmissionToReject(submission);
    setRejectActionType(actionType);
    setIsRejectConfirmDialogOpen(true);
  };

  const handleApproveAction = async () => {
    if (!submissionToApprove || pointsForApproval <= 0 || isNaN(pointsForApproval)) {
        toast({ title: "Invalid Points", description: "Assigned points must be a positive number.", variant: "destructive"});
        return;
    }
    setIsProcessing(true);
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    try {
      const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionToApprove.id!);
      const wordKey = submissionToApprove.wordText.toUpperCase();
      const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
      
      const masterWordSnap = await getDoc(masterWordDocRef);
      if (masterWordSnap.exists()) {
          await updateDoc(submissionDocRef, {
              status: 'Rejected_Duplicate',
              reviewedByUID: currentUserUID,
              reviewedTimestamp: serverTimestamp(),
              moderatorNotes: `Rejected as duplicate. Word already exists in master dictionary. ${notesForApproval || ''}`.trim(),
          });
          toast({ title: "Word Already Exists", description: `${wordKey} is already in the master dictionary. Marked as duplicate.`, variant: "default" });
      } else {
          const newMasterWord: MasterWord = {
              wordText: wordKey,
              points: pointsForApproval,
              definition: submissionToApprove.definition || "No definition provided.",
              frequency: submissionToApprove.frequency,
              status: 'Approved',
              addedByUID: currentUserUID,
              dateAdded: serverTimestamp(),
              originalSubmitterUID: submissionToApprove.submittedByUID,
              puzzleDateGMTOfSubmission: submissionToApprove.puzzleDateGMT,
          };
          await setDoc(masterWordDocRef, newMasterWord);
          await updateDoc(submissionDocRef, {
              status: 'Approved',
              reviewedByUID: currentUserUID,
              reviewedTimestamp: serverTimestamp(),
              assignedPointsOnApproval: pointsForApproval,
              moderatorNotes: notesForApproval.trim(),
          });
          toast({ title: "Word Approved!", description: `${wordKey} added to master dictionary with ${pointsForApproval} points.` });
      }
      
      fetchPendingSubmissions();
      setIsApproveDialogOpen(false);
      setSubmissionToApprove(null);

    } catch (error: any) {
      console.error("Error approving submission:", error);
      toast({ title: "Approval Error", description: `Could not approve submission: ${error.message}`, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectAction = async () => {
    if (!submissionToReject || !rejectActionType) return;

    setIsProcessing(true);
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    try {
      const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionToReject.id!);
      await updateDoc(submissionDocRef, {
        status: rejectActionType,
        reviewedByUID: currentUserUID,
        reviewedTimestamp: serverTimestamp(),
        moderatorNotes: `Rejected: ${rejectActionType}`, // Basic note, can be expanded
      });

      let toastMessage = `Word "${submissionToReject.wordText}" has been rejected.`;

      if (rejectActionType === 'Rejected_NotReal') {
        const userDocRef = doc(firestore, USERS_COLLECTION, submissionToReject.submittedByUID);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const deductionPoints = submissionToReject.wordText.length;
          await updateDoc(userDocRef, {
            overallPersistentScore: increment(-deductionPoints)
          });
          toastMessage += ` ${deductionPoints} points deducted from submitter.`;
        } else {
          toastMessage += ` Submitter's profile not found for point deduction.`;
          console.warn(`User profile ${submissionToReject.submittedByUID} not found for point deduction.`);
        }
      }
      
      toast({ title: "Word Rejected", description: toastMessage });
      fetchPendingSubmissions();
      setIsRejectConfirmDialogOpen(false);
      setSubmissionToReject(null);

    } catch (error: any) {
      console.error("Error rejecting submission:", error);
      toast({ title: "Rejection Error", description: `Could not reject submission: ${error.message}`, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };


  const formatDate = (timestamp: any) => {
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), 'PPP p');
    }
    if (timestamp && timestamp.seconds) {
      return format(new Date(timestamp.seconds * 1000), 'PPP p');
    }
    return 'N/A';
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Word Management & Moderation</h1>
        <p className="text-muted-foreground mt-1">
          Manage the master game dictionary and moderate user-submitted words.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Word Submissions Queue</CardTitle>
            <CardDescription>Review and approve/reject words submitted by players.</CardDescription>
          </div>
           <Button onClick={fetchPendingSubmissions} variant="outline" size="icon" disabled={isLoading || isProcessing}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading submissions...</p>
            </div>
          ) : pendingSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No pending word submissions to review. Great job!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Word</TableHead>
                  <TableHead>Submitted By (UID)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead className="text-center">Frequency</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">{submission.wordText}</TableCell>
                    <TableCell className="font-mono text-xs" title={submission.submittedByUID}>{submission.submittedByUID.substring(0,10)}...</TableCell>
                    <TableCell>{formatDate(submission.submittedTimestamp)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={submission.definition}>
                      {submission.definition ? `${submission.definition.substring(0, 50)}...` : 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      {submission.frequency !== undefined ? submission.frequency.toFixed(2) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isProcessing}>
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Moderate Word</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openApproveDialog(submission)} disabled={isProcessing}>
                            <CheckCircle className="mr-2 h-4 w-4 text-green-500" /> Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRejectConfirmDialog(submission, 'Rejected_NotReal')} disabled={isProcessing}>
                            <FileX2 className="mr-2 h-4 w-4 text-orange-500" /> Reject (Gibberish)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRejectConfirmDialog(submission, 'Rejected_AdminDecision')} disabled={isProcessing}>
                            <ShieldAlert className="mr-2 h-4 w-4 text-red-500" /> Reject (Admin Decision)
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
            <p className="text-xs text-muted-foreground">
              Total pending submissions: {pendingSubmissions.length}
            </p>
          </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Master Game Dictionary</CardTitle>
          <CardDescription>View and manage all approved words in the game. (Functionality TBD)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tools for administrators to search, view, edit, or manually add words to the master dictionary will be implemented here.
          </p>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Word: "{submissionToApprove?.wordText}"</DialogTitle>
            <DialogDescription>
              Assign points and add optional notes for this approval.
            </DialogDescription>
          </DialogHeader>
          {submissionToApprove && (
            <div className="space-y-4 py-2 text-sm">
              <p><strong>Definition:</strong> {submissionToApprove.definition || "Not provided"}</p>
              <p><strong>Frequency Score:</strong> {submissionToApprove.frequency?.toFixed(2) || "Not provided"}</p>
              <div>
                <Label htmlFor="pointsForApproval">Points for Approval</Label>
                <Input
                  id="pointsForApproval"
                  type="number"
                  value={pointsForApproval}
                  onChange={(e) => setPointsForApproval(parseInt(e.target.value,10) || 0)}
                  className="mt-1"
                  disabled={isProcessing}
                />
              </div>
              <div>
                <Label htmlFor="notesForApproval">Moderator Notes (Optional)</Label>
                <Textarea
                  id="notesForApproval"
                  value={notesForApproval}
                  onChange={(e) => setNotesForApproval(e.target.value)}
                  placeholder="e.g., Common word, good addition."
                  className="mt-1"
                  disabled={isProcessing}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button>
            </DialogClose>
            <Button 
              onClick={handleApproveAction} 
              disabled={isProcessing || pointsForApproval <=0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={isRejectConfirmDialogOpen} onOpenChange={setIsRejectConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rejection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject the word "{submissionToReject?.wordText}" as
              {rejectActionType === 'Rejected_NotReal' && " 'Gibberish/Not a real word'"}
              {rejectActionType === 'Rejected_AdminDecision' && " per 'Admin Decision'"}?
              {rejectActionType === 'Rejected_NotReal' && 
                ` This will deduct ${submissionToReject?.wordText.length || 0} points from the submitter.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsRejectConfirmDialogOpen(false)} disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRejectAction} 
              disabled={isProcessing}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle className="mr-2 h-4 w-4" />}
              Yes, Reject Word
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       <p className="text-xs text-muted-foreground text-center">
            Reminder: Word moderation actions update Firestore directly.
            Point deductions for 'Rejected_NotReal' also update user profiles.
            Ensure Firestore Security Rules are configured to protect these operations.
        </p>
    </div>
  );
}

