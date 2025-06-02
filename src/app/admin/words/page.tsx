
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc as getFirestoreDoc, deleteDoc } from 'firebase/firestore'; // Renamed getDoc to avoid conflict if any
import type { WordSubmission, WordSubmissionStatus, MasterWord, UserProfile, RejectedWord, RejectionType } from '@/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, ThumbsUp, ThumbsDown, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const USERS_COLLECTION = "Users";

export default function WordManagementPage() {
  const { toast } = useToast();
  const [pendingSubmissions, setPendingSubmissions] = useState<WordSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [submissionToApprove, setSubmissionToApprove] = useState<WordSubmission | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [notesForApproval, setNotesForApproval] = useState<string>('');
  
  const [processingState, setProcessingState] = useState<Record<string, boolean>>({}); // Tracks processing state per submission ID


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
    setNotesForApproval('');
    setIsApproveDialogOpen(true);
  };

  const handleApproveWordAction = async () => {
    if (!submissionToApprove) return;
    
    const submissionId = submissionToApprove.id!;
    setProcessingState(prev => ({ ...prev, [submissionId]: true }));

    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setProcessingState(prev => ({ ...prev, [submissionId]: false }));
        return;
    }

    try {
      const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);
      const wordKey = submissionToApprove.wordText.toUpperCase();
      const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
      
      const masterWordSnap = await getFirestoreDoc(masterWordDocRef);
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
              definition: submissionToApprove.definition || "No definition provided.",
              frequency: submissionToApprove.frequency || 1, // Default frequency if not present
              status: 'Approved',
              addedByUID: currentUserUID,
              dateAdded: serverTimestamp(),
              originalSubmitterUID: submissionToApprove.submittedByUID,
              puzzleDateGMTOfSubmission: submissionToApprove.puzzleDateGMT,
          };
          await setDoc(masterWordDocRef, newMasterWord);
          // Decide if to update or delete from queue
          await deleteDoc(submissionDocRef); 
          // await updateDoc(submissionDocRef, { 
          //     status: 'Approved',
          //     reviewedByUID: currentUserUID,
          //     reviewedTimestamp: serverTimestamp(),
          //     moderatorNotes: notesForApproval.trim(),
          // });
          toast({ title: "Word Approved!", description: `${wordKey} added to master dictionary.` });
      }
      
      setPendingSubmissions(prev => prev.filter(s => s.id !== submissionId));
      setIsApproveDialogOpen(false);
      setSubmissionToApprove(null);

    } catch (error: any) {
      console.error("Error approving submission:", error);
      toast({ title: "Approval Error", description: `Could not approve submission: ${error.message}`, variant: "destructive" });
    } finally {
      setProcessingState(prev => ({ ...prev, [submissionId]: false }));
    }
  };

  const handleRejectWordAction = async (submission: WordSubmission, rejectionType: RejectionType) => {
    const submissionId = submission.id!;
    setProcessingState(prev => ({ ...prev, [submissionId]: true }));

    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setProcessingState(prev => ({ ...prev, [submissionId]: false }));
        return;
    }
    
    const wordKey = submission.wordText.toUpperCase();
    const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);

    try {
      const newRejectedWord: RejectedWord = {
        wordText: wordKey,
        rejectionType: rejectionType,
        rejectedByUID: currentUserUID,
        dateRejected: serverTimestamp(),
        originalSubmitterUID: submission.submittedByUID,
      };
      await setDoc(rejectedWordDocRef, newRejectedWord, { merge: true }); 

      // Decide if to update or delete from queue
      await deleteDoc(submissionDocRef);
      // await updateDoc(submissionDocRef, { 
      //   status: rejectionType === 'Gibberish' ? 'Rejected_NotReal' : 'Rejected_AdminDecision',
      //   reviewedByUID: currentUserUID,
      //   reviewedTimestamp: serverTimestamp(),
      //   moderatorNotes: `Rejected: ${rejectionType}`,
      // });

      let toastMessage = `Word "${submission.wordText}" has been rejected as ${rejectionType} and added to rejected list.`;

      if (rejectionType === 'Gibberish') {
        const userDocRef = doc(firestore, USERS_COLLECTION, submission.submittedByUID);
        const userSnap = await getFirestoreDoc(userDocRef);
        if (userSnap.exists()) {
          const deductionPoints = submission.wordText.length;
          await updateDoc(userDocRef, {
            overallPersistentScore: increment(-deductionPoints)
          });
          toastMessage += ` ${deductionPoints} points deducted from submitter.`;
        } else {
          toastMessage += ` Submitter's profile not found for point deduction.`;
          console.warn(`User profile ${submission.submittedByUID} not found for point deduction.`);
        }
      }
      
      toast({ title: "Word Rejected", description: toastMessage });
      setPendingSubmissions(prev => prev.filter(s => s.id !== submissionId));

    } catch (error: any) {
      console.error("Error rejecting submission:", error);
      toast({ title: "Rejection Error", description: `Could not reject submission: ${error.message}`, variant: "destructive" });
    } finally {
      setProcessingState(prev => ({ ...prev, [submissionId]: false }));
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
          Review submissions. Approved words go to Master List, rejected words to Rejected List.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Word Submissions Queue</CardTitle>
            <CardDescription>Review and approve/reject words submitted by players.</CardDescription>
          </div>
           <Button onClick={fetchPendingSubmissions} variant="outline" size="icon" disabled={isLoading || Object.values(processingState).some(p => p)}>
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
                    <TableCell className="text-right space-x-1">
                       <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openApproveDialog(submission)} 
                          disabled={processingState[submission.id!] || isLoading}
                          className="text-green-600 hover:text-green-700 hover:bg-green-100"
                        >
                         {processingState[submission.id!] ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1" />} Approve
                       </Button>
                       <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleRejectWordAction(submission, 'Gibberish')} 
                          disabled={processingState[submission.id!] || isLoading}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                        >
                          {processingState[submission.id!] ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4 mr-1" />} Gibberish
                       </Button>
                       <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleRejectWordAction(submission, 'AdminDecision')} 
                          disabled={processingState[submission.id!] || isLoading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-100"
                        >
                          {processingState[submission.id!] ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1" />} Admin Decision
                       </Button>
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
          <CardTitle>Master Game Dictionary & Rejected Words</CardTitle>
          <CardDescription>View/manage approved and permanently rejected words. (Functionality TBD)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Future: Tools to search, view, edit, or manually add/remove words from the Master List or Rejected List.
          </p>
        </CardContent>
      </Card>

      {/* Approve Dialog (Simplified for notes only) */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Word: "{submissionToApprove?.wordText}"</DialogTitle>
            <DialogDescription>
              Add optional notes for this approval. Points are calculated dynamically (Length &times; Frequency).
            </DialogDescription>
          </DialogHeader>
          {submissionToApprove && (
            <div className="space-y-4 py-2 text-sm">
              <p><strong>Definition:</strong> {submissionToApprove.definition || "Not provided"}</p>
              <p><strong>Frequency Score:</strong> {submissionToApprove.frequency?.toFixed(2) || "Not provided"}</p>
               <p><strong>Calculated Points (if approved):</strong> {(submissionToApprove.wordText.length * (submissionToApprove.frequency || 1)).toFixed(0)}</p>
              <div>
                <Label htmlFor="notesForApproval">Moderator Notes (Optional)</Label>
                <Textarea
                  id="notesForApproval"
                  value={notesForApproval}
                  onChange={(e) => setNotesForApproval(e.target.value)}
                  placeholder="e.g., Common word, good addition."
                  className="mt-1"
                  disabled={processingState[submissionToApprove.id!]}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submissionToApprove && processingState[submissionToApprove.id!]}>Cancel</Button>
            </DialogClose>
            <Button 
              onClick={handleApproveWordAction} 
              disabled={!submissionToApprove || processingState[submissionToApprove.id!]}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submissionToApprove && processingState[submissionToApprove.id!] ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       <p className="text-xs text-muted-foreground text-center">
            Word moderation actions update Firestore directly. Rejected words are added to a 'RejectedWords' collection.
            Point deductions for 'Gibberish' rejections update user profiles. Approved words are added to 'Words' master list.
            Submissions are deleted from queue after processing.
        </p>
    </div>
  );
}
