
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { generateShareableMoment, type GenerateShareableMomentOutput } from '@/ai/flows/generate-shareable-moment';
import { useToast } from '@/hooks/use-toast';
import { Copy, Twitter, Check } from 'lucide-react';

interface ShareMomentDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gameData: {
    score: number;
    guessedWotD: boolean;
    wordsFoundCount: number;
    date: string; // YYYY-MM-DD format
    circleName?: string;
    newlyClaimedWordsCount: number; // Added this
  };
}

export function ShareMomentDialog({ isOpen, onOpenChange, gameData }: ShareMomentDialogProps) {
  const [shareContent, setShareContent] = useState<GenerateShareableMomentOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && !shareContent && !isLoading) {
      setIsLoading(true);
      generateShareableMoment(gameData) // gameData now includes newlyClaimedWordsCount
        .then((content) => {
          setShareContent(content);
        })
        .catch((error) => {
          console.error("Failed to generate shareable moment:", error);
          toast({
            title: "Error",
            description: "Could not generate shareable moment. Please try again.",
            variant: "destructive",
          });
          // onOpenChange(false); // Consider if dialog should close on error
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
    if (!isOpen) {
      // Reset state when dialog is closed
      setShareContent(null);
      setHasCopied(false);
    }
  }, [isOpen, gameData, shareContent, isLoading, onOpenChange, toast]);

  const handleCopyToClipboard = () => {
    if (shareContent?.shareableText) {
      navigator.clipboard.writeText(shareContent.shareableText)
        .then(() => {
          setHasCopied(true);
          toast({ title: "Copied to clipboard!" });
          setTimeout(() => setHasCopied(false), 2000);
        })
        .catch(err => {
          console.error("Failed to copy text: ", err);
          toast({ title: "Error", description: "Could not copy text.", variant: "destructive" });
        });
    }
  };

  const handleShareToTwitter = () => {
    if (shareContent?.shareableText) {
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareContent.shareableText)}`;
      window.open(twitterUrl, '_blank');
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline text-center text-primary">Share Your Achievement!</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Let the world know how you did in LexiVerse today!
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-4 py-4">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-6 w-3/4 mx-auto" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {shareContent && !isLoading && (
          <Card className="mt-4 overflow-hidden shadow-lg">
            <CardContent className="p-0">
              {shareContent.imageUri && (
                <Image
                  src={shareContent.imageUri}
                  alt="LexiVerse Shareable Moment"
                  width={500}
                  height={250}
                  className="w-full object-cover"
                  data-ai-hint="game score card"
                />
              )}
              <div className="p-4 whitespace-pre-line text-center text-lg font-medium text-foreground">
                {shareContent.shareableText}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2 p-4 bg-secondary/30">
              <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
                {hasCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {hasCopied ? 'Copied!' : 'Copy Text'}
              </Button>
              <Button onClick={handleShareToTwitter} className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                <Twitter className="mr-2 h-4 w-4" />
                Share on X
              </Button>
            </CardFooter>
          </Card>
        )}
        
        {!isLoading && !shareContent && (
           <div className="text-center py-8 text-muted-foreground">No content to display. Please try reopening this dialog.</div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}  className="w-full">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

