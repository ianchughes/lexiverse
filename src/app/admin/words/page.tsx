
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { firestore } from '@/lib/firebase'; // Removed auth import as currentUser comes from useAuth
import { collection, query, where, getDocs, doc, Timestamp, orderBy, limit, startAfter } from 'firebase/firestore';
import type { WordSubmission, MasterWordType, RejectedWordType, RejectionType } from '@/types';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Star, CheckCircle, XCircle, ThumbsDown, ShieldAlert, Settings2, Send } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { adminBulkProcessWordSubmissionsAction } from './actions'; // Removed single actions for now

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";

type WordAction = 'noAction' | 'approve' | 'rejectGibberish' | 'rejectAdminDecision';


export default function WordManagementPage() {
  const { toast } = useToast();
  const { currentUser } = useAuth(); // Get currentUser from AuthContext
  const [pendingSubmissions, setPendingSubmissions] = useState<WordSubmission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  
  const [masterWordsList, setMasterWordsList] = useState<MasterWordType[]>([]);
  const [isLoadingMasterWords, setIsLoadingMasterWords] = useState(true);
  const [searchTermMasterWords, setSearchTermMasterWords] = useState('');
  
  const [showWordsBySubmitterDialog, setShowWordsBySubmitterDialog] = useState(false);
  const [selectedSubmitterUID, setSelectedSubmitterUID] = useState<string | null>(null);
  const [wordsBySelectedSubmitter, setWordsBySelectedSubmitter] = useState<MasterWordType[]>([]);
  const [hasMounted, setHasMounted] = useState(false);

  const [submissionActions, setSubmissionActions] = useState<Record<string, WordAction>>({});
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [lastVisibleSubmission, setLastVisibleSubmission] = useState<any>(null);


  useEffect(() => {
    setHasMounted(true);
  }, []);

  const fetchPendingSubmissions = useCallback(async (resetPagination = false) => {
    setIsLoadingSubmissions(true);
    if (resetPagination) {
        setLastVisibleSubmission(null);
        setCurrentPage(1);
        setPendingSubmissions([]); 
    }
    try {
      let q = query(
        collection(firestore, WORD_SUBMISSIONS_QUEUE), 
        where("status", "==", "PendingModeratorReview"),
        orderBy("submittedTimestamp", "asc"), 
        limit(itemsPerPage)
      );

      if (lastVisibleSubmission && !resetPagination && currentPage > 1) {
        q = query(
            collection(firestore, WORD_SUBMISSIONS_QUEUE), 
            where("status", "==", "PendingModeratorReview"),
            orderBy("submittedTimestamp", "asc"),
            startAfter(lastVisibleSubmission),
            limit(itemsPerPage)
        );
      }
      
      const querySnapshot = await getDocs(q);
      const submissions: WordSubmission[] = [];
      querySnapshot.forEach((docSnap) => {
        submissions.push({ id: docSnap.id, ...docSnap.data() } as WordSubmission);
      });
      
      setPendingSubmissions(prev => resetPagination ? submissions : [...prev, ...submissions]);
      setLastVisibleSubmission(querySnapshot.docs[querySnapshot.docs.length - 1]);

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
  }, [toast, itemsPerPage, lastVisibleSubmission, currentPage]);


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
  }, [itemsPerPage, fetchPendingSubmissions]); // Added fetchPendingSubmissions to dependency array

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

  const handleSubmissionActionChange = (submissionId: string, action: WordAction) => {
    setSubmissionActions(prev => ({ ...prev, [submissionId]: action }));
  };

  const handleRowSelectionChange = (submissionId: string, checked: boolean) => {
    setSelectedRowIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(submissionId);
      } else {
        newSet.delete(submissionId);
      }
      return newSet;
    });
  };

  const handleSelectAllOnPage = (checked: boolean) => {
    const newSet = new Set(selectedRowIds);
    const submissionIdsOnPage = pendingSubmissions.map(s => s.id!);
    if (checked) {
      submissionIdsOnPage.forEach(id => newSet.add(id));
    } else {
      submissionIdsOnPage.forEach(id => newSet.delete(id));
    }
    setSelectedRowIds(newSet);
  };

  const handleBulkProcessSubmissions = async () => {
    if (!currentUser) { // Client-side authentication check
      toast({ title: "Authentication Error", description: "You must be logged in to moderate. Please log in again.", variant: "destructive" });
      setIsProcessingBulk(false);
      return;
    }

    if (selectedRowIds.size === 0) {
      toast({ title: "No Submissions Selected", description: "Please select submissions to process.", variant: "default" });
      return;
    }
    setIsProcessingBulk(true);

    const submissionsToProcessPayload: Array<{ submissionId: string; wordText: string; definition?: string; frequency?: number; submittedByUID: string; puzzleDateGMT: string; action: WordAction; isWotDClaim?: boolean; }> = [];
    selectedRowIds.forEach(id => {
      const submission = pendingSubmissions.find(s => s.id === id);
      const action = submissionActions[id];
      if (submission && action && action !== 'noAction') {
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
    });

    if (submissionsToProcessPayload.length === 0) {
        toast({ title: "No Actions Selected", description: "Please select an action (Approve/Reject) for the selected submissions.", variant: "default" });
        setIsProcessingBulk(false);
        return;
    }

    try {
      const result = await adminBulkProcessWordSubmissionsAction({ 
        actingAdminId: currentUser.uid, // Pass the admin's UID
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
      
      await fetchPendingSubmissions(true); 
      setSelectedRowIds(new Set());
      fetchMasterWords(); 

    } catch (error: any) {
      toast({ title: "Bulk Action Failed", description: error.message || "Could not process submissions.", variant: "destructive" });
    } finally {
      setIsProcessingBulk(false);
    }
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

  const isAllOnPageSelected = pendingSubmissions.length > 0 && pendingSubmissions.every(s => s.id && selectedRowIds.has(s.id));
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Word Management & Moderation</h1>
        <p className="text-muted-foreground mt-1">
          Review submissions. Approve, reject, or skip. Process selected words in bulk.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Word Submissions Queue</CardTitle>
            <CardDescription>Review and approve/reject words submitted by players.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
             <Select value={String(itemsPerPage)} onValueChange={(val) => {setItemsPerPage(Number(val)); fetchPendingSubmissions(true);}}>
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
                  <TableHead className="w-[50px]">
                    <Checkbox 
                        checked={isAllOnPageSelected}
                        onCheckedChange={(checked) => handleSelectAllOnPage(Boolean(checked))}
                        aria-label="Select all on page"
                        disabled={isProcessingBulk}
                    />
                  </TableHead>
                  <TableHead>Word</TableHead>
                  <TableHead>Submitted By (UID)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead className="text-center">Frequency</TableHead>
                  <TableHead className="w-[200px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSubmissions.map((submission) => (
                  <TableRow key={submission.id} data-state={selectedRowIds.has(submission.id!) ? "selected" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRowIds.has(submission.id!)}
                        onCheckedChange={(checked) => handleRowSelectionChange(submission.id!, Boolean(checked))}
                        aria-labelledby={`select-submission-${submission.id}`}
                        disabled={isProcessingBulk}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{submission.wordText}</TableCell>
                    <TableCell className="font-mono text-xs" title={submission.submittedByUID}>{submission.submittedByUID.substring(0,10)}...</TableCell>
                    <TableCell>{formatDate(submission.submittedTimestamp)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={submission.definition}>
                      {submission.definition ? `${submission.definition.substring(0, 50)}...` : 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      {submission.frequency !== undefined ? submission.frequency.toFixed(2) : 'N/A'}
                    </TableCell>
                    <TableCell>
                       <Select
                        value={submission.id ? submissionActions[submission.id] || 'noAction' : 'noAction'}
                        onValueChange={(value) => handleSubmissionActionChange(submission.id!, value as WordAction)}
                        disabled={isProcessingBulk}
                       >
                         <SelectTrigger className="h-9">
                           <SelectValue placeholder="Select action" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="noAction">No Action</SelectItem>
                           <SelectItem value="approve" className="text-green-600">Approve</SelectItem>
                           <SelectItem value="rejectGibberish" className="text-orange-600">Reject (Gibberish)</SelectItem>
                           <SelectItem value="rejectAdminDecision" className="text-red-600">Reject (Admin)</SelectItem>
                         </SelectContent>
                       </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
         <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Showing {pendingSubmissions.length} submissions. Selected: {selectedRowIds.size}
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
                    disabled={selectedRowIds.size === 0 || isProcessingBulk}
                    className="bg-primary hover:bg-primary/90"
                >
                  {isProcessingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Process Selected ({selectedRowIds.size})
                </Button>
            </div>
          </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Master Game Dictionary</CardTitle>
          <CardDescription>View all approved words and their original submitters.</CardDescription>
          <div className="pt-4">
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
                          <Button variant="link" className="p-0 h-auto text-primary font-mono text-xs" onClick={() => { setSelectedSubmitterUID(word.originalSubmitterUID!); setShowWordsBySubmitterDialog(true); }} title={word.originalSubmitterUID}>
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
       <p className="text-xs text-muted-foreground text-center">
            Word moderation actions update Firestore directly. Use the 'Action' column and 'Process Selected' button.
        </p>
    </div>
  );
}
