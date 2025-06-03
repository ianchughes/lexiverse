
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { firestore } from '@/lib/firebase'; 
import { collection, query, where, getDocs, doc, Timestamp, orderBy, limit, startAfter } from 'firebase/firestore';
import type { WordSubmission, MasterWordType, RejectedWordType, RejectionType } from '@/types';
import { useAuth } from '@/contexts/AuthContext'; 
import { calculateWordScore } from '@/lib/scoring'; 

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Star, CheckCircle, XCircle, ThumbsDown, ShieldAlert, Settings2, Send, UserMinus, MoreHorizontal, CheckIcon, AlertCircleIcon, BanIcon, BadgeCent, UsersSlash } from 'lucide-react'; 
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { adminBulkProcessWordSubmissionsAction, adminDisassociateWordOwnerAction, adminBulkDisassociateWordOwnersAction } from './actions'; 
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";


const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";

type WordAction = 'noAction' | 'approve' | 'rejectGibberish' | 'rejectAdminDecision';


export default function WordManagementPage() {
  const { toast } = useToast();
  const { currentUser } = useAuth(); 
  const [pendingSubmissions, setPendingSubmissions] = useState<WordSubmission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  
  const [masterWordsList, setMasterWordsList] = useState<MasterWordType[]>([]);
  const [isLoadingMasterWords, setIsLoadingMasterWords] = useState(true);
  const [searchTermMasterWords, setSearchTermMasterWords] = useState('');
  
  const [hasMounted, setHasMounted] = useState(false);

  const [submissionActions, setSubmissionActions] = useState<Record<string, WordAction>>({});
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1); 
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [lastVisibleSubmission, setLastVisibleSubmission] = useState<any>(null);

  const [isDisassociateConfirmOpen, setIsDisassociateConfirmOpen] = useState(false);
  const [wordToDisassociate, setWordToDisassociate] = useState<MasterWordType | null>(null);
  const [isProcessingDisassociation, setIsProcessingDisassociation] = useState(false);

  // State for bulk disassociation
  const [selectedWordsForBulkDisassociate, setSelectedWordsForBulkDisassociate] = useState<Set<string>>(new Set());
  const [isProcessingBulkDisassociation, setIsProcessingBulkDisassociation] = useState(false);


  useEffect(() => {
    setHasMounted(true);
  }, []);

  const fetchPendingSubmissions = useCallback(async (resetPagination = false) => {
    setIsLoadingSubmissions(true);
    
    const localLastVisible = resetPagination ? null : lastVisibleSubmission;

    if (resetPagination) {
        setPendingSubmissions([]); 
        setCurrentPage(1); 
        setSubmissionActions({}); 
    }

    try {
      let q = query(
        collection(firestore, WORD_SUBMISSIONS_QUEUE), 
        where("status", "==", "PendingModeratorReview"),
        orderBy("submittedTimestamp", "asc"), 
        limit(itemsPerPage)
      );

      if (localLastVisible && !resetPagination) { 
        q = query(
            collection(firestore, WORD_SUBMISSIONS_QUEUE), 
            where("status", "==", "PendingModeratorReview"),
            orderBy("submittedTimestamp", "asc"),
            startAfter(localLastVisible),
            limit(itemsPerPage)
        );
      }
      
      const querySnapshot = await getDocs(q);
      const submissions: WordSubmission[] = [];
      querySnapshot.forEach((docSnap) => {
        submissions.push({ id: docSnap.id, ...docSnap.data() } as WordSubmission);
      });
      
      setPendingSubmissions(prev => resetPagination ? submissions : [...prev, ...submissions]);
      
      setLastVisibleSubmission(querySnapshot.docs[querySnapshot.docs.length - 1] || null);


      setSubmissionActions(prevActions => {
        const newActions = {...prevActions};
        submissions.forEach(s => {
          if (s.id && !newActions[s.id]) { 
            newActions[s.id] = 'noAction';
          }
        });
        return newActions;
      });

    } catch (error) {
      console.error("Error fetching pending submissions:", error);
      toast({ title: "Error", description: "Could not fetch pending word submissions.", variant: "destructive" });
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, [toast, itemsPerPage, lastVisibleSubmission]); 


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
    fetchPendingSubmissions(true); 
  }, [itemsPerPage]); 

   useEffect(() => {
    fetchMasterWords();
  }, [fetchMasterWords]);


  const handleLoadMoreSubmissions = () => {
    if (lastVisibleSubmission) {
        setCurrentPage(prev => prev + 1);
        fetchPendingSubmissions(false); 
    } else {
        toast({ title: "No More Submissions", description: "All pending submissions have been loaded.", variant: "default"});
    }
  };

  const handleActionCheckboxChange = (submissionId: string, toggledAction: WordAction, isChecked: boolean) => {
    setSubmissionActions(prev => {
      const newActions = { ...prev };
      if (isChecked) {
        newActions[submissionId] = toggledAction;
      } else {
        if (newActions[submissionId] === toggledAction) {
          newActions[submissionId] = 'noAction';
        }
      }
      return newActions;
    });
  };


  const handleBulkProcessSubmissions = async () => {
    if (!currentUser) { 
      toast({ title: "Authentication Error", description: "You must be logged in to moderate. Please log in again.", variant: "destructive" });
      setIsProcessingBulk(false);
      return;
    }

    const submissionsToProcessPayload: Array<{ submissionId: string; wordText: string; definition?: string; frequency?: number; submittedByUID: string; puzzleDateGMT: string; action: WordAction; isWotDClaim?: boolean; }> = [];
    
    Object.entries(submissionActions).forEach(([id, action]) => {
        if (action !== 'noAction') {
            const submission = pendingSubmissions.find(s => s.id === id);
            if (submission) {
                submissionsToProcessPayload.push({
                    submissionId: submission.id!,
                    wordText: submission.wordText,
                    definition: submission.definition,
                    frequency: submission.frequency,
                    submittedByUID: submission.submittedByUID,
                    puzzleDateGMT: submission.puzzleDateGMT,
                    action: action,
                    isWotDClaim: submission.isWotDClaim
                });
            }
        }
    });

    if (submissionsToProcessPayload.length === 0) {
      toast({ title: "No Actions Selected", description: "Please select an action (Approve/Reject) for at least one submission.", variant: "default" });
      return;
    }
    setIsProcessingBulk(true);

    try {
      const result = await adminBulkProcessWordSubmissionsAction({ 
        actingAdminId: currentUser.uid, 
        submissionsToProcess: submissionsToProcessPayload 
      });
      let successCount = 0;
      let errorCount = 0;
      result.results.forEach(res => {
        if (res.status.startsWith('approved') || res.status.startsWith('rejected')) {
          successCount++;
        } else if (res.status === 'error' || res.status === 'error_batch_commit') {
          errorCount++;
          console.error(`Error processing ${res.id}: ${res.error}`);
        }
      });

      if (result.success) {
        toast({ title: "Bulk Processing Complete", description: `${successCount} submissions processed. ${errorCount > 0 ? `${errorCount} failed.` : ''}` });
      } else {
         toast({ title: "Bulk Processing Error", description: `An error occurred during bulk processing. ${successCount} processed, ${errorCount} failed. Details: ${result.error || ''}`, variant: "destructive" });
      }
      
      fetchPendingSubmissions(true); 
      fetchMasterWords(); 

    } catch (error: any) {
      toast({ title: "Bulk Action Failed", description: error.message || "Could not process submissions.", variant: "destructive" });
    } finally {
      setIsProcessingBulk(false);
    }
  };
  
  const ownedMasterWords = useMemo(() => masterWordsList.filter(word => 
    word.originalSubmitterUID && (
      word.wordText.toLowerCase().includes(searchTermMasterWords.toLowerCase()) ||
      word.originalSubmitterUID.toLowerCase().includes(searchTermMasterWords.toLowerCase())
    )
  ), [masterWordsList, searchTermMasterWords]);

  const unclaimedMasterWords = useMemo(() => masterWordsList.filter(word => 
    !word.originalSubmitterUID && word.wordText.toLowerCase().includes(searchTermMasterWords.toLowerCase())
  ), [masterWordsList, searchTermMasterWords]);


  const formatDate = (timestamp: any) => {
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), 'PP p');
    }
    if (timestamp && timestamp.seconds) {
      return format(new Date(timestamp.seconds * 1000), 'PP p');
    }
    return 'N/A';
  };

  const openDisassociateConfirm = (word: MasterWordType) => {
    setWordToDisassociate(word);
    setIsDisassociateConfirmOpen(true);
  };

  const handleConfirmDisassociate = async () => {
    if (!wordToDisassociate || !currentUser) return;
    setIsProcessingDisassociation(true);
    try {
      const result = await adminDisassociateWordOwnerAction({
        wordText: wordToDisassociate.wordText,
        actingAdminId: currentUser.uid,
      });
      if (result.success) {
        toast({ title: "Owner Disassociated", description: `Owner has been removed from "${wordToDisassociate.wordText}".` });
        fetchMasterWords(); 
      } else {
        throw new Error(result.error || "Failed to disassociate owner.");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessingDisassociation(false);
      setIsDisassociateConfirmOpen(false);
      setWordToDisassociate(null);
    }
  };
  
  const itemsToProcessCount = Object.values(submissionActions).filter(action => action !== 'noAction').length;

  // Bulk disassociation logic
  const handleToggleWordForBulkDisassociate = (wordText: string) => {
    setSelectedWordsForBulkDisassociate(prev => {
      const newSet = new Set(prev);
      if (newSet.has(wordText)) {
        newSet.delete(wordText);
      } else {
        newSet.add(wordText);
      }
      return newSet;
    });
  };

  const handleToggleSelectAllForBulkDisassociate = () => {
    if (selectedWordsForBulkDisassociate.size === ownedMasterWords.length) {
      setSelectedWordsForBulkDisassociate(new Set());
    } else {
      setSelectedWordsForBulkDisassociate(new Set(ownedMasterWords.map(w => w.wordText)));
    }
  };

  const handleBulkDisassociate = async () => {
    if (!currentUser || selectedWordsForBulkDisassociate.size === 0) {
      toast({title: "No Words Selected", description: "Please select words to disassociate.", variant: "default"});
      return;
    }
    setIsProcessingBulkDisassociation(true);
    try {
      const result = await adminBulkDisassociateWordOwnersAction({
        wordTexts: Array.from(selectedWordsForBulkDisassociate),
        actingAdminId: currentUser.uid,
      });
      
      const disassociatedCount = result.results.filter(r => r.status === 'disassociated').length;
      const errorCount = result.results.filter(r => r.status !== 'disassociated').length;

      if (result.success) {
        toast({ title: "Bulk Disassociation Complete", description: `${disassociatedCount} words disassociated. ${errorCount > 0 ? `${errorCount} failed.` : ''}` });
      } else {
        toast({ title: "Bulk Disassociation Error", description: result.error || "Some words could not be disassociated.", variant: "destructive" });
      }
      fetchMasterWords();
      setSelectedWordsForBulkDisassociate(new Set());

    } catch (error: any) {
      toast({ title: "Bulk Disassociation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessingBulkDisassociation(false);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Word Management & Moderation</h1>
        <p className="text-muted-foreground mt-1">
          Review submissions. Select an action for each word, then process in bulk.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Word Submissions Queue</CardTitle>
            <CardDescription>Review and approve/reject words submitted by players.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
             <Select value={String(itemsPerPage)} onValueChange={(val) => {setItemsPerPage(Number(val));}}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => fetchPendingSubmissions(true)} variant="outline" size="icon" disabled={isLoadingSubmissions || isProcessingBulk}>
              <RefreshCw className={`h-4 w-4 ${isLoadingSubmissions && !isProcessingBulk ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSubmissions && pendingSubmissions.length === 0 ? (
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
                  <TableHead className="text-center">Calculated Score</TableHead>
                  <TableHead className="w-[250px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSubmissions.map((submission) => {
                  const score = calculateWordScore(submission.wordText, submission.frequency || 1);
                  return (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">{submission.wordText}</TableCell>
                    <TableCell className="font-mono text-xs" title={submission.submittedByUID}>{submission.submittedByUID.substring(0,10)}...</TableCell>
                    <TableCell>{formatDate(submission.submittedTimestamp)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={submission.definition}>
                      {submission.definition ? `${submission.definition.substring(0, 50)}...` : 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <BadgeCent className="h-4 w-4 mr-1 text-amber-500" /> {score}
                      </div>
                    </TableCell>
                    <TableCell>
                       <div className="flex items-center justify-around gap-2">
                        <div className="flex items-center space-x-1" title="Approve">
                            <Checkbox
                                id={`approve-${submission.id}`}
                                checked={submissionActions[submission.id!] === 'approve'}
                                onCheckedChange={(checked) => handleActionCheckboxChange(submission.id!, 'approve', Boolean(checked))}
                                disabled={isProcessingBulk}
                                className="border-green-500 data-[state=checked]:bg-green-500 data-[state=checked]:text-white"
                            />
                            <label htmlFor={`approve-${submission.id}`} className="text-xs text-green-600 sr-only">Approve</label>
                            <CheckIcon className="h-4 w-4 text-green-500" />
                        </div>
                         <div className="flex items-center space-x-1" title="Reject (Gibberish)">
                            <Checkbox
                                id={`reject-gibberish-${submission.id}`}
                                checked={submissionActions[submission.id!] === 'rejectGibberish'}
                                onCheckedChange={(checked) => handleActionCheckboxChange(submission.id!, 'rejectGibberish', Boolean(checked))}
                                disabled={isProcessingBulk}
                                className="border-orange-500 data-[state=checked]:bg-orange-500 data-[state=checked]:text-white"
                            />
                             <label htmlFor={`reject-gibberish-${submission.id}`} className="text-xs text-orange-600 sr-only">Reject Gibberish</label>
                             <AlertCircleIcon className="h-4 w-4 text-orange-500" />
                        </div>
                        <div className="flex items-center space-x-1" title="Reject (Admin Decision)">
                            <Checkbox
                                id={`reject-admin-${submission.id}`}
                                checked={submissionActions[submission.id!] === 'rejectAdminDecision'}
                                onCheckedChange={(checked) => handleActionCheckboxChange(submission.id!, 'rejectAdminDecision', Boolean(checked))}
                                disabled={isProcessingBulk}
                                className="border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:text-white"
                            />
                             <label htmlFor={`reject-admin-${submission.id}`} className="text-xs text-red-600 sr-only">Reject Admin</label>
                             <BanIcon className="h-4 w-4 text-red-500" />
                        </div>
                       </div>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          )}
        </CardContent>
         <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Showing {pendingSubmissions.length} submissions on page {currentPage}. Actions selected for: {itemsToProcessCount}
            </p>
            <div className="flex gap-2">
                 <Button 
                    variant="outline" 
                    onClick={handleLoadMoreSubmissions} 
                    disabled={isLoadingSubmissions || !lastVisibleSubmission || isProcessingBulk}
                >
                    {isLoadingSubmissions && !isProcessingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Load More
                </Button>
                <Button 
                    onClick={handleBulkProcessSubmissions} 
                    disabled={itemsToProcessCount === 0 || isProcessingBulk}
                    className="bg-primary hover:bg-primary/90"
                >
                  {isProcessingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Process Selected ({itemsToProcessCount})
                </Button>
            </div>
          </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owned Words in Dictionary</CardTitle>
          <CardDescription>View all approved words that currently have an original submitter. Admins can disassociate owners here.</CardDescription>
          <div className="pt-4 flex items-center gap-2">
            {hasMounted ? (
                <Input 
                placeholder="Search by Word or Submitter UID..."
                value={searchTermMasterWords}
                onChange={(e) => setSearchTermMasterWords(e.target.value)}
                className="max-w-sm"
                />
            ) : (
                <Skeleton className="h-10 w-full max-w-sm" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMasterWords ? (
             <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading owned words...</p>
            </div>
          ) : ownedMasterWords.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No owned words found{searchTermMasterWords ? ' matching your search' : ''}.</p>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                       <Checkbox
                        checked={selectedWordsForBulkDisassociate.size > 0 && selectedWordsForBulkDisassociate.size === ownedMasterWords.filter(w => w.originalSubmitterUID).length}
                        indeterminate={selectedWordsForBulkDisassociate.size > 0 && selectedWordsForBulkDisassociate.size < ownedMasterWords.filter(w => w.originalSubmitterUID).length}
                        onCheckedChange={handleToggleSelectAllForBulkDisassociate}
                        aria-label="Select all owned words for disassociation"
                        disabled={isProcessingBulkDisassociation}
                      />
                    </TableHead>
                    <TableHead>Word</TableHead>
                    <TableHead>Definition</TableHead>
                    <TableHead className="text-center">Frequency</TableHead>
                    <TableHead>Original Submitter (UID)</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownedMasterWords.map((word) => (
                    <TableRow key={word.wordText} data-state={selectedWordsForBulkDisassociate.has(word.wordText) ? "selected" : ""}>
                       <TableCell>
                        <Checkbox
                          checked={selectedWordsForBulkDisassociate.has(word.wordText)}
                          onCheckedChange={() => handleToggleWordForBulkDisassociate(word.wordText)}
                          aria-label={`Select word ${word.wordText} for disassociation`}
                          disabled={isProcessingBulkDisassociation}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{word.wordText}</TableCell>
                      <TableCell className="max-w-xs truncate" title={word.definition}>{word.definition.substring(0,50)}...</TableCell>
                      <TableCell className="text-center">{word.frequency.toFixed(2)}</TableCell>
                      <TableCell>
                        {word.originalSubmitterUID ? (
                          <span className="font-mono text-xs" title={word.originalSubmitterUID}>
                            {word.originalSubmitterUID.substring(0,10)}... <Star className="h-3 w-3 ml-1 fill-amber-400 text-amber-500 inline"/>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(word.dateAdded)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isProcessingDisassociation && wordToDisassociate?.wordText === word.wordText || isProcessingBulkDisassociation}>
                                {isProcessingDisassociation && wordToDisassociate?.wordText === word.wordText ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => openDisassociateConfirm(word)} 
                              disabled={!word.originalSubmitterUID || (isProcessingDisassociation && wordToDisassociate?.wordText === word.wordText) || isProcessingBulkDisassociation}
                              className={!word.originalSubmitterUID ? "text-muted-foreground" : "text-orange-600 focus:text-orange-600 focus:bg-orange-50"}
                            >
                              <UserMinus className="mr-2 h-4 w-4" /> Disassociate Owner
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
        <CardFooter className="flex justify-between items-center border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {ownedMasterWords.length} owned words. Selected for disassociation: {selectedWordsForBulkDisassociate.size}
            </p>
            <Button
                onClick={handleBulkDisassociate}
                disabled={selectedWordsForBulkDisassociate.size === 0 || isProcessingBulkDisassociation}
                variant="destructive"
            >
                {isProcessingBulkDisassociation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UsersSlash className="mr-2 h-4 w-4" />}
                Disassociate Selected ({selectedWordsForBulkDisassociate.size})
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Unclaimed Words in Dictionary</CardTitle>
            <CardDescription>These words are approved but currently have no owner. They can be claimed if a user submits them and an admin approves.</CardDescription>
             <div className="pt-4">
                 <Input 
                    placeholder="Search unclaimed words..."
                    value={searchTermMasterWords} // Uses the same search term as owned words for simplicity here
                    onChange={(e) => setSearchTermMasterWords(e.target.value)}
                    className="max-w-sm"
                    disabled={isLoadingMasterWords}
                />
            </div>
        </CardHeader>
        <CardContent>
             {isLoadingMasterWords ? (
                 <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2 text-muted-foreground">Loading unclaimed words...</p>
                </div>
            ) : unclaimedMasterWords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No unclaimed words found{searchTermMasterWords ? ' matching your search' : ''}.</p>
            ) : (
                <ScrollArea className="h-[300px]">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Word</TableHead>
                        <TableHead>Definition</TableHead>
                        <TableHead className="text-center">Frequency</TableHead>
                        <TableHead>Date Added/Modified</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {unclaimedMasterWords.map((word) => (
                        <TableRow key={word.wordText}>
                        <TableCell className="font-medium">{word.wordText}</TableCell>
                        <TableCell className="max-w-xs truncate" title={word.definition}>{word.definition.substring(0,50)}...</TableCell>
                        <TableCell className="text-center">{word.frequency.toFixed(2)}</TableCell>
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
              Total unclaimed words: {unclaimedMasterWords.length}
            </p>
        </CardFooter>
      </Card>


       <p className="text-xs text-muted-foreground text-center">
            Word moderation actions update Firestore directly. Use the 'Action' column and 'Process Selected' button.
        </p>

      {wordToDisassociate && (
        <AlertDialog open={isDisassociateConfirmOpen} onOpenChange={setIsDisassociateConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Disassociation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove the original submitter from the word "{wordToDisassociate.wordText}"?
                This means the original submitter will no longer receive claimer bonuses for this word. This action cannot be easily undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessingDisassociation} onClick={() => setIsDisassociateConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConfirmDisassociate} 
                disabled={isProcessingDisassociation}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isProcessingDisassociation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Disassociate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </div>
  );
}
