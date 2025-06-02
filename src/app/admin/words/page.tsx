
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore, auth } from '@/lib/firebase'; // Assuming auth might be needed for reviewer UID
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { WordSubmission, WordSubmissionStatus, MasterWord } from '@/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Edit, Loader2, Filter, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';


const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";

export default function WordManagementPage() {
  const { toast } = useToast();
  const [pendingSubmissions, setPendingSubmissions] = useState<WordSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<WordSubmission | null>(null);
  
  // State for the moderation dialog
  const [isModerationDialogOpen, setIsModerationDialogOpen] = useState(false);
  const [moderationAction, setModerationAction] = useState<'approve' | 'reject' | null>(null);
  const [assignedPoints, setAssignedPoints] = useState<number>(0);
  const [moderatorNotes, setModeratorNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<WordSubmissionStatus | null>(null);
  const [isProcessingModeration, setIsProcessingModeration] = useState(false);


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

  const openModerationDialog = (submission: WordSubmission) => {
    setSelectedSubmission(submission);
    setAssignedPoints(submission.wordText.length * 10); // Default points suggestion
    setModeratorNotes('');
    setRejectionReason(null);
    setIsModerationDialogOpen(true);
  };

  const handleModeration = async () => {
    if (!selectedSubmission || !moderationAction) return;
    if (moderationAction === 'approve' && (assignedPoints <= 0 || isNaN(assignedPoints))) {
        toast({ title: "Invalid Points", description: "Assigned points must be a positive number.", variant: "destructive"});
        return;
    }

    setIsProcessingModeration(true);
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setIsProcessingModeration(false);
        return;
    }

    try {
      const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, selectedSubmission.id!);

      if (moderationAction === 'approve') {
        const wordKey = selectedSubmission.wordText.toUpperCase();
        const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
        
        // Check if word already exists in master dictionary
        const masterWordSnap = await getDoc(masterWordDocRef);
        if (masterWordSnap.exists()) {
            await updateDoc(submissionDocRef, {
                status: 'Rejected_Duplicate',
                reviewedByUID: currentUserUID,
                reviewedTimestamp: serverTimestamp(),
                moderatorNotes: `Rejected as duplicate. Word already exists in master dictionary. ${moderatorNotes || ''}`.trim(),
            });
            toast({ title: "Word Already Exists", description: `${wordKey} is already in the master dictionary. Marked as duplicate.`, variant: "default" });
        } else {
            const newMasterWord: MasterWord = {
                wordText: wordKey,
                points: assignedPoints,
                definition: selectedSubmission.definition || "No definition provided.",
                frequency: selectedSubmission.frequency,
                status: 'Approved',
                addedByUID: currentUserUID,
                dateAdded: serverTimestamp(),
                originalSubmitterUID: selectedSubmission.submittedByUID,
                puzzleDateGMTOfSubmission: selectedSubmission.puzzleDateGMT,
            };
            await setDoc(masterWordDocRef, newMasterWord);
            await updateDoc(submissionDocRef, {
                status: 'Approved',
                reviewedByUID: currentUserUID,
                reviewedTimestamp: serverTimestamp(),
                assignedPointsOnApproval: assignedPoints,
                moderatorNotes: moderatorNotes.trim(),
            });
            toast({ title: "Word Approved!", description: `${wordKey} added to master dictionary with ${assignedPoints} points.` });
        }

      } else if (moderationAction === 'reject' && rejectionReason) {
        await updateDoc(submissionDocRef, {
          status: rejectionReason,
          reviewedByUID: currentUserUID,
          reviewedTimestamp: serverTimestamp(),
          moderatorNotes: moderatorNotes.trim(),
        });
        toast({ title: "Word Rejected", description: `${selectedSubmission.wordText} has been rejected.` });
      }
      
      fetchPendingSubmissions(); // Refresh the list
      setIsModerationDialogOpen(false);
      setSelectedSubmission(null);

    } catch (error: any) {
      console.error("Error processing moderation:", error);
      toast({ title: "Moderation Error", description: `Could not process moderation: ${error.message}`, variant: "destructive" });
    } finally {
      setIsProcessingModeration(false);
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
           <Button onClick={fetchPendingSubmissions} variant="outline" size="icon" disabled={isLoading}>
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
                    <TableCell className="font-mono text-xs">{submission.submittedByUID.substring(0,10)}...</TableCell>
                    <TableCell>{formatDate(submission.submittedTimestamp)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={submission.definition}>
                      {submission.definition ? `${submission.definition.substring(0, 50)}...` : 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      {submission.frequency !== undefined ? submission.frequency.toFixed(2) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openModerationDialog(submission)}>
                        <Edit className="mr-2 h-3 w-3" /> Moderate
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
          <CardTitle>Master Game Dictionary</CardTitle>
          <CardDescription>View and manage all approved words in the game. (Functionality TBD)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tools for administrators to search, view, edit, or manually add words to the master dictionary will be implemented here.
          </p>
        </CardContent>
      </Card>

      {selectedSubmission && (
        <AlertDialog open={isModerationDialogOpen} onOpenChange={setIsModerationDialogOpen}>
          <AlertDialogContent className="sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Moderate Word: "{selectedSubmission.wordText}"</AlertDialogTitle>
              <AlertDialogDescription>
                Review the details and decide to approve or reject this submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-2 text-sm">
              <p><strong>Definition:</strong> {selectedSubmission.definition || "Not provided"}</p>
              <p><strong>Frequency Score:</strong> {selectedSubmission.frequency?.toFixed(2) || "Not provided"}</p>
              <p><strong>Submitted by UID:</strong> {selectedSubmission.submittedByUID}</p>
              <p><strong>Submitted on Puzzle Date:</strong> {selectedSubmission.puzzleDateGMT}</p>
               <hr />
              <div>
                <Label htmlFor="moderatorNotes">Moderator Notes (Optional)</Label>
                <Textarea
                  id="moderatorNotes"
                  value={moderatorNotes}
                  onChange={(e) => setModeratorNotes(e.target.value)}
                  placeholder="e.g., Common word, good addition."
                  className="mt-1"
                  disabled={isProcessingModeration}
                />
              </div>
            </div>

            <AlertDialogFooter className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-4">
              <div className="sm:col-span-3 space-y-2">
                 <Label htmlFor="assignedPoints">Points if Approved (auto-suggested)</Label>
                <Input
                  id="assignedPoints"
                  type="number"
                  value={assignedPoints}
                  onChange={(e) => setAssignedPoints(parseInt(e.target.value,10) || 0)}
                  className="w-full mb-2"
                  disabled={isProcessingModeration}
                />
                <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => { setModerationAction('approve'); handleModeration(); }}
                    disabled={isProcessingModeration || assignedPoints <= 0}
                >
                    {isProcessingModeration && moderationAction === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Approve Word
                </Button>
              </div>
            </AlertDialogFooter>
             <AlertDialogFooter className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                 <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => { setModerationAction('reject'); setRejectionReason('Rejected_NotReal'); handleModeration(); }}
                    disabled={isProcessingModeration}
                >
                    {isProcessingModeration && moderationAction === 'reject' && rejectionReason === 'Rejected_NotReal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle className="mr-2 h-4 w-4" />}
                    Reject (Not Real/Gibberish)
                </Button>
                <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => { setModerationAction('reject'); setRejectionReason('Rejected_AdminDecision'); handleModeration(); }}
                    disabled={isProcessingModeration}
                >
                    {isProcessingModeration && moderationAction === 'reject' && rejectionReason === 'Rejected_AdminDecision' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle className="mr-2 h-4 w-4" />}
                    Reject (Admin Decision)
                </Button>
             </AlertDialogFooter>
             <AlertDialogFooter className="pt-4">
                 <AlertDialogCancel onClick={() => setIsModerationDialogOpen(false)} disabled={isProcessingModeration} className="w-full">Cancel</AlertDialogCancel>
             </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
       <p className="text-xs text-muted-foreground text-center">
            Reminder: Word moderation actions update Firestore directly.
            Ensure Firestore Security Rules are configured to protect these operations.
        </p>
    </div>
  );
}
