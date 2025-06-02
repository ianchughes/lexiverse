
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc as getFirestoreDoc, deleteDoc, orderBy } from 'firebase/firestore';
import type { WordSubmission, WordSubmissionStatus, MasterWordType, UserProfile, RejectedWordType, RejectionType } from '@/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComp } from "@/components/ui/alert-dialog"; // Renamed AlertDialogTitle
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, ThumbsUp, ThumbsDown, ShieldAlert, Loader2, RefreshCw, Settings2, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const USERS_COLLECTION = "Users";

export default function WordManagementPage() {
  const { toast } = useToast();
  const [pendingSubmissions, setPendingSubmissions] = useState<WordSubmission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  
  const [submissionToProcess, setSubmissionToProcess] = useState<WordSubmission | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [rejectActionType, setRejectActionType] = useState<RejectionType | null>(null);
  
  const [notesForApproval, setNotesForApproval] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [masterWordsList, setMasterWordsList] = useState<MasterWordType[]>([]);
  const [isLoadingMasterWords, setIsLoadingMasterWords] = useState(true);
  const [searchTermMasterWords, setSearchTermMasterWords] = useState('');
  
  const [showWordsBySubmitterDialog, setShowWordsBySubmitterDialog] = useState(false);
  const [selectedSubmitterUID, setSelectedSubmitterUID] = useState<string | null>(null);
  const [wordsBySelectedSubmitter, setWordsBySelectedSubmitter] = useState<MasterWordType[]>([]);


  const fetchPendingSubmissions = useCallback(async () => {
    setIsLoadingSubmissions(true);
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
        return tsA.toMillis() - tsB.toMillis(); 
      });
      setPendingSubmissions(submissions);
    } catch (error) {
      console.error("Error fetching pending submissions:", error);
      toast({ title: "Error", description: "Could not fetch pending word submissions.", variant: "destructive" });
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, [toast]);

  const fetchMasterWords = useCallback(async () => {
    setIsLoadingMasterWords(true);
    try {
      const q = query(collection(firestore, MASTER_WORDS_COLLECTION), orderBy("dateAdded", "desc"));
      const querySnapshot = await getDocs(q);
      const words: MasterWordType[] = [];
      querySnapshot.forEach((docSnap) => {
        words.push({ wordText: docSnap.id, ...docSnap.data() } as MasterWordType);
      });
      setMasterWordsList(words);
    } catch (error) {
      console.error("Error fetching master words:", error);
      toast({ title: "Error", description: "Could not fetch master word list.", variant: "destructive" });
    } finally {
      setIsLoadingMasterWords(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingSubmissions();
    fetchMasterWords();
  }, [fetchPendingSubmissions, fetchMasterWords]);

  const openApproveDialog = (submission: WordSubmission) => {
    setSubmissionToProcess(submission);
    setNotesForApproval('');
    setIsApproveDialogOpen(true);
  };

  const openRejectConfirmDialog = (submission: WordSubmission, type: RejectionType) => {
    setSubmissionToProcess(submission);
    setRejectActionType(type);
    setIsRejectConfirmOpen(true);
  };

  const handleApproveWordAction = async () => {
    if (!submissionToProcess) return;
    
    setIsProcessing(true);
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    try {
      const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionToProcess.id!);
      const wordKey = submissionToProcess.wordText.toUpperCase();
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
          const newMasterWord: MasterWordType = {
              wordText: wordKey,
              definition: submissionToProcess.definition || "No definition provided.",
              frequency: submissionToProcess.frequency || 1, 
              status: 'Approved',
              addedByUID: currentUserUID,
              dateAdded: serverTimestamp(),
              originalSubmitterUID: submissionToProcess.submittedByUID,
              puzzleDateGMTOfSubmission: submissionToProcess.puzzleDateGMT,
          };
          await setDoc(masterWordDocRef, newMasterWord);
          await deleteDoc(submissionDocRef); 
          toast({ title: "Word Approved!", description: `${wordKey} added to master dictionary.` });
          fetchMasterWords(); // Refresh master list
      }
      
      setPendingSubmissions(prev => prev.filter(s => s.id !== submissionToProcess.id));
      setIsApproveDialogOpen(false);
      setSubmissionToProcess(null);

    } catch (error: any) {
      console.error("Error approving submission:", error);
      toast({ title: "Approval Error", description: `Could not approve submission: ${error.message}`, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectAction = async () => {
    if (!submissionToProcess || !rejectActionType) return;
    
    setIsProcessing(true);
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        toast({ title: "Authentication Error", description: "You must be logged in to moderate.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
    
    const wordKey = submissionToProcess.wordText.toUpperCase();
    const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionToProcess.id!);

    try {
      const newRejectedWord: RejectedWordType = {
        wordText: wordKey,
        rejectionType: rejectActionType,
        rejectedByUID: currentUserUID,
        dateRejected: serverTimestamp(),
        originalSubmitterUID: submissionToProcess.submittedByUID,
      };
      await setDoc(rejectedWordDocRef, newRejectedWord, { merge: true }); 
      await deleteDoc(submissionDocRef);

      let toastMessage = `Word "${submissionToProcess.wordText}" has been rejected as ${rejectActionType} and added to rejected list.`;

      if (rejectActionType === 'Gibberish') {
        const userDocRef = doc(firestore, USERS_COLLECTION, submissionToProcess.submittedByUID);
        const userSnap = await getFirestoreDoc(userDocRef);
        if (userSnap.exists()) {
          const deductionPoints = submissionToProcess.wordText.length;
          await updateDoc(userDocRef, {
            overallPersistentScore: increment(-deductionPoints)
          });
          toastMessage += ` ${deductionPoints} points deducted from submitter.`;
        } else {
          toastMessage += ` Submitter's profile not found for point deduction.`;
        }
      }
      
      toast({ title: "Word Rejected", description: toastMessage });
      setPendingSubmissions(prev => prev.filter(s => s.id !== submissionToProcess!.id));
      // No need to fetchRejectedWords separately as they are not displayed in a list yet

    } catch (error: any) {
      console.error("Error rejecting submission:", error);
      toast({ title: "Rejection Error", description: `Could not reject submission: ${error.message}`, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setIsRejectConfirmOpen(false);
      setSubmissionToProcess(null);
      setRejectActionType(null);
    }
  };

  const handleShowWordsBySubmitter = (submitterUID: string) => {
    const words = masterWordsList.filter(word => word.originalSubmitterUID === submitterUID);
    setWordsBySelectedSubmitter(words);
    setSelectedSubmitterUID(submitterUID);
    setShowWordsBySubmitterDialog(true);
  };
  
  const filteredMasterWords = masterWordsList.filter(word => 
    word.wordText.toLowerCase().includes(searchTermMasterWords.toLowerCase()) ||
    (word.originalSubmitterUID && word.originalSubmitterUID.toLowerCase().includes(searchTermMasterWords.toLowerCase()))
  );

  const formatDate = (timestamp: any) => {
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), 'PP p');
    }
    if (timestamp && timestamp.seconds) {
      return format(new Date(timestamp.seconds * 1000), 'PP p');
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
           <Button onClick={fetchPendingSubmissions} variant="outline" size="icon" disabled={isLoadingSubmissions || isProcessing}>
            <RefreshCw className={`h-4 w-4 ${isLoadingSubmissions ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingSubmissions ? (
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
                            {isProcessing && submissionToProcess?.id === submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Moderate "{submission.wordText}"</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openApproveDialog(submission)} className="text-green-600 focus:text-green-700 focus:bg-green-100">
                            <ThumbsUp className="mr-2 h-4 w-4" /> Approve Word
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRejectConfirmDialog(submission, 'Gibberish')} className="text-orange-600 focus:text-orange-700 focus:bg-orange-100">
                            <ThumbsDown className="mr-2 h-4 w-4" /> Reject (Gibberish)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRejectConfirmDialog(submission, 'AdminDecision')} className="text-red-600 focus:text-red-700 focus:bg-red-100">
                            <ShieldAlert className="mr-2 h-4 w-4" /> Reject (Admin Decision)
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
          <CardDescription>View all approved words and their original submitters.</CardDescription>
          <div className="pt-4">
            <Input 
              placeholder="Search by Word or Submitter UID..."
              value={searchTermMasterWords}
              onChange={(e) => setSearchTermMasterWords(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMasterWords ? (
             <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading master dictionary...</p>
            </div>
          ) : filteredMasterWords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No words found in the master dictionary{searchTermMasterWords ? ' matching your search' : ''}.</p>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Word</TableHead>
                    <TableHead>Definition</TableHead>
                    <TableHead className="text-center">Frequency</TableHead>
                    <TableHead>Original Submitter (UID)</TableHead>
                    <TableHead>Date Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMasterWords.map((word) => (
                    <TableRow key={word.wordText}>
                      <TableCell className="font-medium">{word.wordText}</TableCell>
                      <TableCell className="max-w-xs truncate" title={word.definition}>{word.definition.substring(0,50)}...</TableCell>
                      <TableCell className="text-center">{word.frequency.toFixed(2)}</TableCell>
                      <TableCell>
                        {word.originalSubmitterUID ? (
                          <Button variant="link" className="p-0 h-auto text-primary font-mono text-xs" onClick={() => handleShowWordsBySubmitter(word.originalSubmitterUID!)} title={word.originalSubmitterUID}>
                            {word.originalSubmitterUID.substring(0,10)}... <Star className="h-3 w-3 ml-1 fill-amber-400 text-amber-500 inline"/>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A (System)</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(word.dateAdded)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">
              Total words in dictionary: {masterWordsList.length}
            </p>
        </CardFooter>
      </Card>

      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Word: "{submissionToProcess?.wordText}"</DialogTitle>
            <DialogDescription>
              Confirm approval. Frequency is from WordsAPI.
            </DialogDescription>
          </DialogHeader>
          {submissionToProcess && (
            <div className="space-y-4 py-2 text-sm">
              <p><strong>Definition:</strong> {submissionToProcess.definition || "Not provided"}</p>
              <p><strong>Frequency Score:</strong> {submissionToProcess.frequency?.toFixed(2) || "Not provided"}</p>
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
              onClick={handleApproveWordAction} 
              disabled={!submissionToProcess || isProcessing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isRejectConfirmOpen} onOpenChange={setIsRejectConfirmOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitleComp>Confirm Rejection</AlertDialogTitleComp>
                <AlertDialogDescription>
                    Are you sure you want to reject the word "{submissionToProcess?.wordText}" as "{rejectActionType}"?
                    {rejectActionType === 'Gibberish' && ` This will deduct ${submissionToProcess?.wordText.length || 0} points from the submitter.`}
                    This action cannot be undone easily.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isProcessing} onClick={() => setIsRejectConfirmOpen(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRejectAction} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Reject
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedSubmitterUID && (
        <Dialog open={showWordsBySubmitterDialog} onOpenChange={setShowWordsBySubmitterDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Words Submitted by UID: {selectedSubmitterUID.substring(0,10)}...</DialogTitle>
              <DialogDescription>
                This user was the original submitter for the following words in the master dictionary:
              </DialogDescription>
            </DialogHeader>
            {wordsBySelectedSubmitter.length > 0 ? (
              <ScrollArea className="h-60 my-4 border rounded-md p-2">
                <ul className="space-y-1">
                  {wordsBySelectedSubmitter.map(word => (
                    <li key={word.wordText} className="text-sm p-1 bg-muted/50 rounded-sm">{word.wordText}</li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <p className="my-4 text-muted-foreground">This user has not submitted any words to the master dictionary yet.</p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

       <p className="text-xs text-muted-foreground text-center">
            Word moderation actions update Firestore directly. Rejected words are added to 'RejectedWords' collection.
            Point deductions for 'Gibberish' rejections update user profiles. Approved words are added to 'Words' master list.
            Submissions are deleted from queue after processing. Master dictionary shows approved words.
        </p>
    </div>
  );
}

