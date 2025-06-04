
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from '@/components/ui/date-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit2, Trash2, Sparkles, Save, Loader2, RefreshCw, CalendarSync, Shuffle, Dices } from 'lucide-react';
import type { DailyPuzzle, AdminPuzzleFormState, ClientPuzzleSuggestion, GeneratePuzzleSuggestionsOutput } from '@/types';
import { generatePuzzleSuggestions } from '@/ai/flows/generate-puzzle-suggestions';
import { format } from 'date-fns';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, Timestamp, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { 
  adminCreateDailyPuzzleAction, 
  adminUpdateDailyPuzzleAction, 
  adminDeleteDailyPuzzleAction,
  adminSaveGeneratedPuzzlesAction,
  adminFillPuzzleGapsAction,
  adminReseedUpcomingPuzzlesAction
} from './actions';

const DAILY_PUZZLES_COLLECTION = "DailyPuzzles";

async function fetchPuzzlesFromFirestore(): Promise<DailyPuzzle[]> {
  const puzzlesCollectionRef = collection(firestore, DAILY_PUZZLES_COLLECTION);
  const q = query(puzzlesCollectionRef, orderBy("id")); 
  const querySnapshot = await getDocs(q);
  const firestorePuzzles: DailyPuzzle[] = [];
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    firestorePuzzles.push({
      id: docSnap.id,
      puzzleDateGMT: (data.puzzleDateGMT as Timestamp).toDate(),
      wordOfTheDayText: data.wordOfTheDayText,
      wordOfTheDayPoints: data.wordOfTheDayPoints,
      seedingLetters: data.seedingLetters,
      status: data.status,
      wordOfTheDayDefinition: data.wordOfTheDayDefinition || '',
    });
  });
  return firestorePuzzles.sort((a, b) => a.puzzleDateGMT.getTime() - b.puzzleDateGMT.getTime());
}

const initialFormState: AdminPuzzleFormState = {
  puzzleDateGMT: undefined,
  wordOfTheDayText: '',
  wordOfTheDayPoints: 0,
  seedingLetters: '',
  status: 'Upcoming',
  wordOfTheDayDefinition: '',
};


export default function DailyPuzzleManagementPage() {
  const { toast } = useToast();
  const { currentUser: actingAdmin } = useAuth();
  const [puzzles, setPuzzles] = useState<DailyPuzzle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPuzzleId, setEditingPuzzleId] = useState<string | null>(null);
  const [originalEditingWotD, setOriginalEditingWotD] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdminPuzzleFormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AdminPuzzleFormState, string>>>({});
  const [formabilityError, setFormabilityError] = useState<string>('');

  const [generationQuantity, setGenerationQuantity] = useState<number>(5); 
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [puzzleSuggestions, setPuzzleSuggestions] = useState<ClientPuzzleSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());
  const [isReRandomizing, setIsReRandomizing] = useState(false); 

  const [isFillingGaps, setIsFillingGaps] = useState(false);
  const [isFillGapsConfirmOpen, setIsFillGapsConfirmOpen] = useState(false);

  const [isReseedingAll, setIsReseedingAll] = useState(false);
  const [isReseedAllConfirmOpen, setIsReseedAllConfirmOpen] = useState(false);


  const fetchPuzzles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchPuzzlesFromFirestore(); 
      setPuzzles(data);
    } catch (error) {
      console.error("Error fetching puzzles:", error);
      toast({ title: "Error fetching puzzles", description: (error as Error).message || "Could not load puzzle data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPuzzles();
  }, [fetchPuzzles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { 
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'wordOfTheDayPoints' ? parseInt(value,10) || 0 : value }));
    if (formErrors[name as keyof AdminPuzzleFormState]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }));
    }
     if (name === 'wordOfTheDayText' || name === 'seedingLetters') {
      setFormabilityError('');
    }
  };
  
  const handleStatusChange = (value: 'Upcoming' | 'Active') => {
    setFormData(prev => ({ ...prev, status: value }));
  };

  const handleDateChange = (date: Date | undefined) => {
    setFormData(prev => ({ ...prev, puzzleDateGMT: date }));
     if (formErrors.puzzleDateGMT) {
      setFormErrors(prev => ({ ...prev, puzzleDateGMT: undefined }));
    }
  };
  
  const countLetters = (str: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const char of str.toUpperCase()) {
      counts[char] = (counts[char] || 0) + 1;
    }
    return counts;
  };

  const checkFormability = useCallback(() => {
    const { wordOfTheDayText, seedingLetters } = formData;
    if (!wordOfTheDayText || !seedingLetters || seedingLetters.length !== 9) {
      setFormabilityError('');
      return true; 
    }

    const wotdCounts = countLetters(wordOfTheDayText);
    const seedingCounts = countLetters(seedingLetters);

    for (const char in wotdCounts) {
      if (!seedingCounts[char] || wotdCounts[char] > seedingCounts[char]) {
        setFormabilityError(`Word "${wordOfTheDayText.toUpperCase()}" cannot be formed. Not enough '${char}'.`);
        return false;
      }
    }
    setFormabilityError('');
    return true;
  }, [formData]);

  useEffect(() => {
    checkFormability();
  }, [formData.wordOfTheDayText, formData.seedingLetters, checkFormability]);


  const validateForm = () => {
    const errors: Partial<Record<keyof AdminPuzzleFormState, string>> = {};
    if (!formData.puzzleDateGMT) errors.puzzleDateGMT = "Puzzle date is required.";
    
    const wotdTrimmed = formData.wordOfTheDayText.trim();
    if (!wotdTrimmed) errors.wordOfTheDayText = "Word of the Day is required.";
    else if (wotdTrimmed.length < 6 || wotdTrimmed.length > 9) {
      errors.wordOfTheDayText = "Word of the Day must be 6-9 characters.";
    } else if (!/^[A-Z]+$/i.test(wotdTrimmed)) {
       errors.wordOfTheDayText = "Word of the Day must contain only English letters.";
    } else {
        const wotdToCheck = wotdTrimmed.toUpperCase();
        const wotdChangedDuringEdit = editingPuzzleId && originalEditingWotD && wotdToCheck !== originalEditingWotD.toUpperCase();
        
        if (!editingPuzzleId || wotdChangedDuringEdit) { 
            const isWotDAlreadyUsed = puzzles.some(p => 
                p.wordOfTheDayText.toUpperCase() === wotdToCheck &&
                (!editingPuzzleId || p.id !== editingPuzzleId) 
            );
            if (isWotDAlreadyUsed) {
                errors.wordOfTheDayText = (errors.wordOfTheDayText ? errors.wordOfTheDayText + " " : "") + "This Word of the Day is already used in another puzzle.";
            }
        }
    }

    if (formData.wordOfTheDayPoints <= 0) errors.wordOfTheDayPoints = "Points must be greater than 0.";
    
    const seedingLettersTrimmed = formData.seedingLetters.trim();
    if (!seedingLettersTrimmed) errors.seedingLetters = "Seeding letters are required.";
    else if (seedingLettersTrimmed.length !== 9) errors.seedingLetters = "Exactly 9 seeding letters are required.";
     else if (!/^[A-Z]+$/i.test(seedingLettersTrimmed)) {
       errors.seedingLetters = "Seeding letters must contain only English letters.";
    }

    const definitionTrimmed = formData.wordOfTheDayDefinition?.trim() ?? '';
    if (!definitionTrimmed) {
        errors.wordOfTheDayDefinition = "Word of the Day definition is required.";
    } else if (definitionTrimmed.length > 250) {
        errors.wordOfTheDayDefinition = "Definition cannot exceed 250 characters.";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actingAdmin) {
        toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive"});
        return;
    }
    if (!validateForm()) return;
    if (!checkFormability()) return;

    setIsSubmittingForm(true);
    try {
      let result;
      if (editingPuzzleId) {
        result = await adminUpdateDailyPuzzleAction({ puzzleId: editingPuzzleId, puzzleData: formData, actingAdminId: actingAdmin.uid });
        if (result.success) toast({ title: "Puzzle Updated", description: `Puzzle for ${editingPuzzleId} has been updated.` });
      } else {
        result = await adminCreateDailyPuzzleAction({ puzzleData: formData, actingAdminId: actingAdmin.uid });
        if (result.success) toast({ title: "Puzzle Created", description: `New puzzle for ${format(formData.puzzleDateGMT!, 'PPP')} has been saved.` });
      }
      if (!result.success) throw new Error(result.error || "Failed to save puzzle.");
      
      setShowForm(false);
      setEditingPuzzleId(null);
      setOriginalEditingWotD(null);
      setFormData(initialFormState);
      fetchPuzzles(); 
    } catch (error: any) {
      toast({ title: "Error Saving Puzzle", description: error.message || "Could not save puzzle.", variant: "destructive" });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const openCreateForm = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(null);
    setOriginalEditingWotD(null);
    setShowForm(true);
  };

  const openEditForm = (puzzle: DailyPuzzle) => {
    setFormData({
      puzzleDateGMT: puzzle.puzzleDateGMT,
      wordOfTheDayText: puzzle.wordOfTheDayText,
      wordOfTheDayPoints: puzzle.wordOfTheDayPoints,
      seedingLetters: puzzle.seedingLetters,
      status: puzzle.status === 'Expired' ? 'Upcoming' : puzzle.status,
      wordOfTheDayDefinition: puzzle.wordOfTheDayDefinition || '',
    });
    setOriginalEditingWotD(puzzle.wordOfTheDayText);
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(puzzle.id);
    setShowForm(true);
  };

  const handleDelete = async (puzzle: DailyPuzzle) => {
    if (!actingAdmin) {
        toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive"});
        return;
    }
    setIsLoading(true); // Use main loading for quick delete op
    try {
      const result = await adminDeleteDailyPuzzleAction({ puzzleId: puzzle.id, puzzleDateGMTString: format(puzzle.puzzleDateGMT, 'PPP'), actingAdminId: actingAdmin.uid });
      if (result.success) {
        toast({ title: "Puzzle Deleted", description: `Puzzle for ${format(puzzle.puzzleDateGMT, 'PPP')} has been deleted.` });
        fetchPuzzles(); 
      } else {
        throw new Error(result.error || "Failed to delete puzzle.");
      }
    } catch (error: any) {
      toast({ title: "Error Deleting Puzzle", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    if (generationQuantity < 1 || generationQuantity > 100) {
      toast({ title: "Invalid Quantity", description: "Please enter a quantity between 1 and 100.", variant: "destructive" });
      return;
    }
    setIsGeneratingSuggestions(true);
    setPuzzleSuggestions([]); 
    setSelectedSuggestionIds(new Set());

    try {
      const result: GeneratePuzzleSuggestionsOutput = await generatePuzzleSuggestions({ quantity: generationQuantity });
      if (result.suggestions && result.suggestions.length > 0) {
        setPuzzleSuggestions(result.suggestions.map(s => ({ 
          ...s, 
          id: crypto.randomUUID() 
        })));
        toast({ title: "Suggestions Generated", description: `${result.suggestions.length} puzzle suggestions have been generated with definitions.` });
      } else {
        toast({ title: "No Suggestions", description: "The AI didn't return any valid suggestions with definitions. Check WordsAPI key or AI flow logs.", variant: "default" });
      }
    } catch (error: any) {
      console.error("Error generating puzzle suggestions:", error);
      toast({ title: "Generation Failed", description: error.message || "Could not generate puzzle suggestions.", variant: "destructive" });
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleReRandomizeWords = async () => {
    setIsReRandomizing(true);
    try {
      const result: GeneratePuzzleSuggestionsOutput = await generatePuzzleSuggestions({ quantity: 1 });
      if (result.suggestions && result.suggestions.length > 0) {
        const suggestion = result.suggestions[0];
        setFormData(prev => ({
          ...prev,
          wordOfTheDayText: suggestion.wordOfTheDayText,
          seedingLetters: suggestion.seedingLetters,
          wordOfTheDayDefinition: suggestion.wordOfTheDayDefinition,
          wordOfTheDayPoints: suggestion.wordOfTheDayText.length * 10,
        }));
        toast({ title: "Words Re-randomized", description: "New WotD, Seeding Letters, and Definition populated." });
      } else {
        toast({ title: "Re-randomization Failed", description: "The AI didn't return a valid suggestion. Please try again.", variant: "default" });
      }
    } catch (error: any) {
      console.error("Error re-randomizing words:", error);
      toast({ title: "Error", description: error.message || "Could not re-randomize words.", variant: "destructive" });
    } finally {
      setIsReRandomizing(false);
    }
  };

  const handleToggleSelectSuggestion = (suggestionId: string) => {
    setSelectedSuggestionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(suggestionId)) {
        newSet.delete(suggestionId);
      } else {
        newSet.add(suggestionId);
      }
      return newSet;
    });
  };
  
  const handleSaveSelectedPuzzles = async () => {
    if (!actingAdmin) {
        toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive"});
        return;
    }
    if (selectedSuggestionIds.size === 0) {
      toast({ title: "No Puzzles Selected", description: "Please select at least one puzzle suggestion to save.", variant: "default" });
      return;
    }
    setIsLoading(true); 
    const puzzlesToSaveFromSuggestions = puzzleSuggestions.filter(s => selectedSuggestionIds.has(s.id));
    
    try {
        const result = await adminSaveGeneratedPuzzlesAction({ puzzlesToSave: puzzlesToSaveFromSuggestions, actingAdminId: actingAdmin.uid });
        if (result.success && result.savedCount > 0) {
            toast({ title: "Puzzles Saved", description: `${result.savedCount} puzzles have been scheduled.` });
            fetchPuzzles(); 
            setPuzzleSuggestions([]); 
            setSelectedSuggestionIds(new Set());
        } else {
            throw new Error(result.error || `Failed to save ${result.savedCount > 0 ? 'some' : 'any'} puzzles.`);
        }
    } catch (error: any) {
        toast({ title: "Error Saving Puzzles", description: error.message, variant: "destructive"});
    } finally {
        setIsLoading(false);
    }
  };

  const handleFillGaps = async () => {
    if (!actingAdmin) {
        toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive"});
        return;
    }
    setIsFillingGaps(true);
    try {
      const result = await adminFillPuzzleGapsAction({ actingAdminId: actingAdmin.uid });
      if (result.success && result.movedCount > 0) {
        toast({ title: "Gaps Filled", description: `${result.movedCount} upcoming puzzles were re-dated.` });
        fetchPuzzles();
      } else {
        toast({ title: result.error ? "Error" : "No Gaps", description: result.error || "No gaps to fill or no puzzles re-dated.", variant: result.error ? "destructive" : "default" });
      }
    } catch (error: any) {
      console.error("Error filling gaps:", error);
      toast({ title: "Error Filling Gaps", description: error.message || "Could not re-date puzzles.", variant: "destructive" });
    } finally {
      setIsFillingGaps(false);
      setIsFillGapsConfirmOpen(false);
    }
  };

  const handleReseedAllUpcomingPuzzles = async () => {
    if (!actingAdmin) {
        toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive"});
        return;
    }
    setIsReseedingAll(true);
    try {
      const result = await adminReseedUpcomingPuzzlesAction({ actingAdminId: actingAdmin.uid });
       if (result.success && result.reseededCount > 0) {
        toast({ title: "Puzzles Reseeded", description: `${result.reseededCount} upcoming puzzles have been reseeded successfully.` });
        fetchPuzzles();
      } else {
        toast({ title: result.error ? "Error" : "No Puzzles", description: result.error || "No upcoming puzzles to reseed.", variant: result.error ? "destructive" : "default" });
      }
    } catch (error: any) {
      console.error("Error reseeding all puzzles:", error);
      toast({ title: "Error Reseeding Puzzles", description: error.message || "Could not reseed puzzles.", variant: "destructive" });
    } finally {
      setIsReseedingAll(false);
      setIsReseedAllConfirmOpen(false);
    }
  };

  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Puzzle Management</h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage daily puzzles.
          </p>
        </div>
        <Button onClick={openCreateForm}><PlusCircle className="mr-2 h-4 w-4" /> Add New Puzzle</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{editingPuzzleId ? 'Edit Puzzle' : 'Create New Puzzle'}</CardTitle>
                <CardDescription>
                  {editingPuzzleId ? `Editing puzzle for ${format(formData.puzzleDateGMT || new Date(), 'PPP')}` : 'Define a new daily challenge for players.'}
                </CardDescription>
              </div>
              {editingPuzzleId && (
                <Button variant="outline" onClick={handleReRandomizeWords} disabled={isReRandomizing || isSubmittingForm}>
                  {isReRandomizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shuffle className="mr-2 h-4 w-4" />}
                  Re-randomize Words
                </Button>
              )}
            </div>
          </CardHeader>
          <form onSubmit={handleFormSubmit}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="puzzleDateGMT">Puzzle Date (GMT)</Label>
                  <DatePicker 
                    date={formData.puzzleDateGMT} 
                    setDate={handleDateChange} 
                    disabled={(date) => 
                      editingPuzzleId ? true : 
                      puzzles.some(p => 
                        format(p.puzzleDateGMT, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                      )
                    }
                  />
                  {formErrors.puzzleDateGMT && <p className="text-sm text-destructive mt-1">{formErrors.puzzleDateGMT}</p>}
                  {editingPuzzleId && <p className="text-xs text-muted-foreground mt-1">Date cannot be changed when editing an existing puzzle.</p>}
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={handleStatusChange}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Upcoming">Upcoming</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="wordOfTheDayText">Word of the Day (6-9 letters)</Label>
                <Input id="wordOfTheDayText" name="wordOfTheDayText" value={formData.wordOfTheDayText} onChange={handleInputChange} maxLength={9} />
                {formErrors.wordOfTheDayText && <p className="text-sm text-destructive mt-1">{formErrors.wordOfTheDayText}</p>}
              </div>
               <div>
                <Label htmlFor="wordOfTheDayDefinition">Word of the Day Definition</Label>
                <Textarea id="wordOfTheDayDefinition" name="wordOfTheDayDefinition" value={formData.wordOfTheDayDefinition || ''} onChange={handleInputChange} placeholder="Enter the definition..." />
                {formErrors.wordOfTheDayDefinition && <p className="text-sm text-destructive mt-1">{formErrors.wordOfTheDayDefinition}</p>}
              </div>
              <div>
                <Label htmlFor="wordOfTheDayPoints">Word of the Day Points</Label>
                <Input id="wordOfTheDayPoints" name="wordOfTheDayPoints" type="number" value={formData.wordOfTheDayPoints} onChange={handleInputChange} />
                {formErrors.wordOfTheDayPoints && <p className="text-sm text-destructive mt-1">{formErrors.wordOfTheDayPoints}</p>}
              </div>
              <div>
                <Label htmlFor="seedingLetters">Seeding Letters (Exactly 9 letters)</Label>
                <Input id="seedingLetters" name="seedingLetters" value={formData.seedingLetters} onChange={handleInputChange} maxLength={9} />
                {formErrors.seedingLetters && <p className="text-sm text-destructive mt-1">{formErrors.seedingLetters}</p>}
              </div>
              {formabilityError && <p className="text-sm text-destructive mt-1">{formabilityError}</p>}
               <p className="text-xs text-muted-foreground">
                 Note: WotD existence in Master Dictionary and point accuracy should be verified. Formability from seeding letters is checked client-side. Duplicate WotD check also performed.
               </p>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingPuzzleId(null); setOriginalEditingWotD(null); }} disabled={isSubmittingForm || isReRandomizing}>Cancel</Button>
              <Button type="submit" disabled={!!formabilityError || isSubmittingForm || isReRandomizing}>
                {isSubmittingForm ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : (editingPuzzleId ? 'Update Puzzle' : 'Create Puzzle')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Generate Puzzle Suggestions (AI)</CardTitle>
          <CardDescription>
            Let AI generate new Word of the Day (with definitions from WordsAPI) and Seeding Letter combinations.
            Selected puzzles will be scheduled for the next available future dates. AI will attempt to avoid duplicate Words of the Day.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-grow">
              <Label htmlFor="generationQuantity">Number of Puzzles to Generate (1-100)</Label>
              <Input
                id="generationQuantity"
                type="number"
                value={generationQuantity}
                onChange={(e) => setGenerationQuantity(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
                min="1"
                max="100"
                disabled={isGeneratingSuggestions || isFillingGaps || isReseedingAll}
                className="w-full"
              />
            </div>
            <Button onClick={handleGenerateSuggestions} disabled={isGeneratingSuggestions || isLoading || isFillingGaps || isReseedingAll}>
              {isGeneratingSuggestions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </div>

          {isGeneratingSuggestions && <p className="text-muted-foreground text-center py-4"><Loader2 className="inline mr-2 h-4 w-4 animate-spin" />Generating suggestions with definitions...</p>}

          {puzzleSuggestions.length > 0 && !isGeneratingSuggestions && (
            <div className="space-y-3 mt-4">
              <h3 className="text-lg font-semibold">Generated Suggestions:</h3>
              <div className="max-h-96 overflow-y-auto space-y-2 border p-3 rounded-md bg-muted/20">
                {puzzleSuggestions.map((suggestion) => (
                  <Card key={suggestion.id} className={`p-3 transition-colors cursor-pointer hover:border-primary ${selectedSuggestionIds.has(suggestion.id) ? 'border-primary bg-secondary' : 'bg-background'}`} onClick={() => handleToggleSelectSuggestion(suggestion.id)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-grow pr-2">
                        <p className="font-semibold">WotD: <span className="font-mono text-primary">{suggestion.wordOfTheDayText}</span></p>
                        <p className="text-sm text-muted-foreground">Seeding: <span className="font-mono">{suggestion.seedingLetters}</span></p>
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={suggestion.wordOfTheDayDefinition}>Definition: {suggestion.wordOfTheDayDefinition}</p>
                      </div>
                      <Checkbox
                        checked={selectedSuggestionIds.has(suggestion.id)}
                        onCheckedChange={() => handleToggleSelectSuggestion(suggestion.id)}
                        id={`select-suggestion-${suggestion.id}`}
                        aria-label={`Select puzzle suggestion ${suggestion.wordOfTheDayText}`}
                        className="mt-1"
                      />
                    </div>
                  </Card>
                ))}
              </div>
              <Button onClick={handleSaveSelectedPuzzles} disabled={selectedSuggestionIds.size === 0 || isLoading || isGeneratingSuggestions || isFillingGaps || isReseedingAll} className="w-full mt-4">
                {isLoading && selectedSuggestionIds.size > 0 ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Save className="mr-2 h-4 w-4" />) } 
                Save Selected ({selectedSuggestionIds.size})
              </Button>
            </div>
          )}
          {puzzleSuggestions.length === 0 && !isGeneratingSuggestions && generationQuantity > 0 && (
             <p className="text-sm text-muted-foreground text-center py-2">
              No suggestions generated, or all were filtered out. Try again, check AI flow logs, or ensure WordsAPI key is correctly configured.
            </p>
          )}
          <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <h3 className="text-md font-semibold mb-2">Puzzle Schedule Maintenance</h3>
                <AlertDialog open={isFillGapsConfirmOpen} onOpenChange={setIsFillGapsConfirmOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" className="w-full" disabled={isLoading || isGeneratingSuggestions || isFillingGaps || isReseedingAll}>
                            <CalendarSync className="mr-2 h-4 w-4" />
                            Fill Date Gaps in Upcoming
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Fill Gaps</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will re-date 'Upcoming' puzzles to fill any gaps, starting from the day after the last Active/Expired puzzle (or tomorrow if none). Original 'Upcoming' puzzle entries will be deleted and re-created with new dates. This action cannot be easily undone. Are you sure?
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel disabled={isFillingGaps}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleFillGaps} disabled={isFillingGaps}>
                            {isFillingGaps ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Yes, Fill Gaps
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <p className="text-xs text-muted-foreground mt-1">Ensures 'Upcoming' puzzles are sequential without empty days.</p>
            </div>
            <div>
                <h3 className="text-md font-semibold mb-2">Seeding Letter Maintenance</h3>
                <AlertDialog open={isReseedAllConfirmOpen} onOpenChange={setIsReseedAllConfirmOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" className="w-full" disabled={isLoading || isGeneratingSuggestions || isFillingGaps || isReseedingAll}>
                            <Dices className="mr-2 h-4 w-4" />
                            Reseed All Upcoming Puzzles
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Reseed All</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will regenerate and randomize the 9 seeding letters for ALL 'Upcoming' puzzles, ensuring their Word of the Day remains formable. This action cannot be easily undone. Are you sure?
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel disabled={isReseedingAll}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReseedAllUpcomingPuzzles} disabled={isReseedingAll}>
                            {isReseedingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Yes, Reseed All
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <p className="text-xs text-muted-foreground mt-1">Randomizes seeding letters for all 'Upcoming' puzzles.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle>Puzzle List</CardTitle>
            <CardDescription>View and manage all puzzles.</CardDescription>
          </div>
           <Button onClick={fetchPuzzles} variant="outline" size="icon" disabled={isLoading || isGeneratingSuggestions || isFillingGaps || isReseedingAll}>
              <RefreshCw className={`h-4 w-4 ${isLoading && !isGeneratingSuggestions && !isFillingGaps && !isReseedingAll ? 'animate-spin' : ''}`} />
            </Button>
        </CardHeader>
        <CardContent>
          {isLoading && !isGeneratingSuggestions && puzzles.length === 0 ? ( 
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Loading puzzles...</p>
            </div>
          ) : puzzles.length === 0 && !isGeneratingSuggestions ? (
            <p className="text-muted-foreground text-center py-10">No puzzles found. Click "Add New Puzzle" or "Generate Suggestions".</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date (GMT)</TableHead>
                  <TableHead>Word of the Day</TableHead>
                  <TableHead>Seeding Letters</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puzzles.map((puzzle) => (
                    <TableRow key={puzzle.id}>
                      <TableCell>{format(puzzle.puzzleDateGMT, 'yyyy-MM-dd')}</TableCell>
                      <TableCell>{puzzle.wordOfTheDayText}</TableCell>
                      <TableCell>{puzzle.seedingLetters}</TableCell>
                      <TableCell>{puzzle.wordOfTheDayPoints}</TableCell>
                      <TableCell>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                              puzzle.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100' :
                              puzzle.status === 'Upcoming' ? 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100'
                          }`}>
                              {puzzle.status}
                          </span>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditForm(puzzle)} title="Edit" disabled={isSubmittingForm || isLoading || isGeneratingSuggestions || isFillingGaps || isReseedingAll || isReRandomizing}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive" disabled={isSubmittingForm || isLoading || isGeneratingSuggestions || isFillingGaps || isReseedingAll || isReRandomizing}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the puzzle for {format(puzzle.puzzleDateGMT, 'PPP')}.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isLoading || isFillingGaps || isReseedingAll}>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDelete(puzzle)} 
                                disabled={isLoading || isFillingGaps || isReseedingAll} 
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              >
                                {isLoading && editingPuzzleId === null ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Yes, delete puzzle"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">
              Displaying {puzzles.length} puzzles.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}

    