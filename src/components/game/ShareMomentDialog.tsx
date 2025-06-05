
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
    newlyClaimedWordsCount: number;
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
      generateShareableMoment(gameData)
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
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
    if (!isOpen) {
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
          let description = "Could not copy link.";
          if (err instanceof Error && err.name === 'NotAllowedError') {
            description = "Clipboard permission denied. Please allow clipboard access in your browser settings.";
          } else if (err instanceof Error) {
            description = `Could not copy link: ${err.message}. Check console for details.`;
          }
          toast({title: "Error", description: description, variant: "destructive"});
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
      <DialogContent className="sm:max-w-md bg-card text-card-foreground p-4">
        <DialogHeader className="pb-2 text-center">
          <DialogTitle className="text-xl font-headline text-primary">Share Your Achievement!</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Let the world know how you did in LexiVerse today!
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-2">
            <Skeleton className="h-40 w-full rounded-lg" /> {/* Slightly smaller skeleton for image */}
            <Skeleton className="h-5 w-3/4 mx-auto" /> {/* Skeleton for text */}
            <Skeleton className="h-9 w-full" /> {/* Skeleton for buttons */}
          </div>
        )}

        {shareContent && !isLoading && (
          <Card className="mt-2 overflow-hidden shadow-md border-none">
            <CardContent className="p-0">
              {shareContent.imageUri && (
                 <div className="bg-muted/30 aspect-[2/1] overflow-hidden rounded-t-md">
                    <Image
                      src={shareContent.imageUri}
                      alt="LexiVerse Shareable Moment"
                      width={500}
                      height={250}
                      className="w-full h-full object-cover"
                      data-ai-hint="game score card"
                      priority // Eager load the image as it's key content
                    />
                  </div>
              )}
              <div className="p-3 whitespace-pre-line text-center text-base font-medium text-foreground">
                {shareContent.shareableText}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2 p-3 bg-secondary/20">
              <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto text-sm">
                {hasCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {hasCopied ? 'Copied!' : 'Copy Text'}
              </Button>
              <Button onClick={handleShareToTwitter} className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
                <Twitter className="mr-2 h-4 w-4" />
                Share on X
              </Button>
            </CardFooter>
          </Card>
        )}
        
        {!isLoading && !shareContent && (
           <div className="text-center py-6 text-muted-foreground">No content to display. Please try reopening this dialog.</div>
        )}

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}  className="w-full text-sm">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
