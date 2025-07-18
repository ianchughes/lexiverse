
'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { processWordSubmission, type ProcessedWordResult, type ProcessWordSubmissionParams } from '@/services/wordProcessingService';

// The parameters for the hook's submit function will be a subset of ProcessWordSubmissionParams,
// as the hook will provide the currentUserId.
type SubmitWordParams = Omit<ProcessWordSubmissionParams, 'currentUserId'>;

export function useWordSubmission() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const submitWord = useCallback(async (params: SubmitWordParams): Promise<ProcessedWordResult | null> => {
    if (!currentUser) {
      toast({
        title: "Not Authenticated",
        description: "You must be logged in to submit a word.",
        variant: "destructive",
      });
      return null;
    }

    setIsProcessing(true);
    try {
      const result = await processWordSubmission({
        ...params,
        currentUserId: currentUser.uid,
      });
      return result;
    } catch (error: any) {
      console.error("Error in submitWord hook:", error);
      toast({
        title: "Submission Error",
        description: error.message || "An unknown error occurred during submission.",
        variant: "destructive",
      });
      return null; // Return null on catastrophic failure
    } finally {
      setIsProcessing(false);
    }
  }, [currentUser, toast]);

  return { submitWord, isProcessing };
}
