
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from '@/components/ui/date-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit2, Trash2, Search, ExternalLink } from 'lucide-react';
import type { DailyPuzzle, AdminPuzzleFormState } from '@/types';
import { format, parseISO } from 'date-fns';

// Mock data and functions - Replace with actual API calls to Cloud Functions
let MOCK_PUZZLES: DailyPuzzle[] = [
  { id: '2025-07-01', puzzleDateGMT: new Date('2025-07-01T00:00:00Z'), wordOfTheDayText: 'EXAMPLE', wordOfTheDayPoints: 50, seedingLetters: 'AEILMPRXE', status: 'Upcoming' },
  { id: '2025-07-02', puzzleDateGMT: new Date('2025-07-02T00:00:00Z'), wordOfTheDayText: 'ANOTHER', wordOfTheDayPoints: 60, seedingLetters: 'NOHRETABX', status: 'Active' },
];

async function mockFetchPuzzles(): Promise<DailyPuzzle[]> {
  return new Promise(resolve => setTimeout(() => resolve([...MOCK_PUZZLES]), 500));
}

async function mockCreateDailyPuzzle(puzzleData: AdminPuzzleFormState): Promise<DailyPuzzle> {
  console.log('Mock creating puzzle:', puzzleData);
  if (!puzzleData.puzzleDateGMT) throw new Error("Date is required");
  const newId = format(puzzleData.puzzleDateGMT, 'yyyy-MM-dd');
  if (MOCK_PUZZLES.find(p => p.id === newId)) {
    throw new Error(`A puzzle already exists for ${newId}.`);
  }
  const newPuzzle: DailyPuzzle = {
    ...puzzleData,
    id: newId,
    puzzleDateGMT: puzzleData.puzzleDateGMT,
    status: puzzleData.status,
  };
  MOCK_PUZZLES.push(newPuzzle);
  MOCK_PUZZLES.sort((a,b) => a.puzzleDateGMT.getTime() - b.puzzleDateGMT.getTime());
  return new Promise(resolve => setTimeout(() => resolve(newPuzzle), 300));
}

async function mockUpdateDailyPuzzle(id: string, puzzleData: AdminPuzzleFormState): Promise<DailyPuzzle> {
  console.log('Mock updating puzzle:', id, puzzleData);
  const index = MOCK_PUZZLES.findIndex(p => p.id === id);
  if (index === -1) throw new Error("Puzzle not found");
  if (!puzzleData.puzzleDateGMT) throw new Error("Date is required");

  const updatedPuzzle: DailyPuzzle = {
    ...MOCK_PUZZLES[index],
    ...puzzleData,
    puzzleDateGMT: puzzleData.puzzleDateGMT,
    status: puzzleData.status,
  };
  MOCK_PUZZLES[index] = updatedPuzzle;
  MOCK_PUZZLES.sort((a,b) => a.puzzleDateGMT.getTime() - b.puzzleDateGMT.getTime());
  return new Promise(resolve => setTimeout(() => resolve(updatedPuzzle), 300));
}

async function mockDeleteDailyPuzzle(id: string): Promise<void> {
  console.log('Mock deleting puzzle:', id);
  MOCK_PUZZLES = MOCK_PUZZLES.filter(p => p.id !== id);
  return new Promise(resolve => setTimeout(() => resolve(), 300));
}
// End Mock data and functions


const initialFormState: AdminPuzzleFormState = {
  puzzleDateGMT: undefined,
  wordOfTheDayText: '',
  wordOfTheDayPoints: 0,
  seedingLetters: '',
  status: 'Upcoming',
};

export default function DailyPuzzleManagementPage() {
  const { toast } = useToast();
  const [puzzles, setPuzzles] = useState<DailyPuzzle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPuzzleId, setEditingPuzzleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdminPuzzleFormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AdminPuzzleFormState, string>>>({});
   const [formabilityError, setFormabilityError] = useState<string>('');

  const fetchPuzzles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await mockFetchPuzzles();
      setPuzzles(data);
    } catch (error) {
      toast({ title: "Error fetching puzzles", description: "Could not load puzzle data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPuzzles();
  }, [fetchPuzzles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      return true; // Validation will catch empty/wrong length fields
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
    if (!formData.wordOfTheDayText.trim()) errors.wordOfTheDayText = "Word of the Day is required.";
    else if (formData.wordOfTheDayText.length < 6 || formData.wordOfTheDayText.length > 9) {
      errors.wordOfTheDayText = "Word of the Day must be 6-9 characters.";
    } else if (!/^[A-Z]+$/i.test(formData.wordOfTheDayText)) {
       errors.wordOfTheDayText = "Word of the Day must contain only English letters.";
    }
    if (formData.wordOfTheDayPoints <= 0) errors.wordOfTheDayPoints = "Points must be greater than 0.";
    if (!formData.seedingLetters.trim()) errors.seedingLetters = "Seeding letters are required.";
    else if (formData.seedingLetters.length !== 9) errors.seedingLetters = "Exactly 9 seeding letters are required.";
     else if (!/^[A-Z]+$/i.test(formData.seedingLetters)) {
       errors.seedingLetters = "Seeding letters must contain only English letters.";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!checkFormability()) return; // Re-check formability on submit

    // TODO: Implement server-side check if WotD exists in Words table
    // For now, we'll assume it does or admin is responsible.

    try {
      if (editingPuzzleId) {
        await mockUpdateDailyPuzzle(editingPuzzleId, formData);
        toast({ title: "Puzzle Updated", description: `Puzzle for ${format(formData.puzzleDateGMT!, 'PPP')} has been updated.` });
      } else {
        await mockCreateDailyPuzzle(formData);
        toast({ title: "Puzzle Created", description: `New puzzle for ${format(formData.puzzleDateGMT!, 'PPP')} has been created.` });
      }
      setShowForm(false);
      setEditingPuzzleId(null);
      setFormData(initialFormState);
      fetchPuzzles(); // Refresh list
    } catch (error: any) {
      toast({ title: "Error Saving Puzzle", description: error.message || "Could not save puzzle.", variant: "destructive" });
    }
  };

  const openCreateForm = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(null);
    setShowForm(true);
  };

  const openEditForm = (puzzle: DailyPuzzle) => {
    setFormData({
      puzzleDateGMT: puzzle.puzzleDateGMT,
      wordOfTheDayText: puzzle.wordOfTheDayText,
      wordOfTheDayPoints: puzzle.wordOfTheDayPoints,
      seedingLetters: puzzle.seedingLetters,
      status: puzzle.status === 'Expired' ? 'Upcoming' : puzzle.status, // Cannot edit to 'Expired'
    });
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(puzzle.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await mockDeleteDailyPuzzle(id);
      toast({ title: "Puzzle Deleted", description: `Puzzle ${id} has been deleted.` });
      fetchPuzzles(); // Refresh list
    } catch (error: any) {
      toast({ title: "Error Deleting Puzzle", description: error.message || "Could not delete puzzle.", variant: "destructive" });
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Puzzle Management</h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage daily puzzles, including Word of the Day and seeding letters.
          </p>
        </div>
        <Button onClick={openCreateForm}><PlusCircle className="mr-2 h-4 w-4" /> Add New Puzzle</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingPuzzleId ? 'Edit Puzzle' : 'Create New Puzzle'}</CardTitle>
            <CardDescription>
              {editingPuzzleId ? `Editing puzzle for ${format(formData.puzzleDateGMT || new Date(), 'PPP')}` : 'Define a new daily challenge for players.'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleFormSubmit}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="puzzleDateGMT">Puzzle Date (GMT)</Label>
                  <DatePicker date={formData.puzzleDateGMT} setDate={handleDateChange} 
                    disabled={(date) => editingPuzzleId ? false : MOCK_PUZZLES.some(p => format(p.puzzleDateGMT, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'))}
                  />
                  {formErrors.puzzleDateGMT && <p className="text-sm text-destructive mt-1">{formErrors.puzzleDateGMT}</p>}
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
                 Note: WotD existence in Master Dictionary and point accuracy should be verified. Formability from seeding letters is checked client-side.
               </p>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingPuzzleId(null); }}>Cancel</Button>
              <Button type="submit" disabled={!!formabilityError}>
                {editingPuzzleId ? 'Update Puzzle' : 'Create Puzzle'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Puzzle List</CardTitle>
          <CardDescription>View and manage all upcoming, active, and past puzzles.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading puzzles...</p>
          ) : puzzles.length === 0 ? (
            <p className="text-muted-foreground">No puzzles found. Click "Add New Puzzle" to create one.</p>
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
                            puzzle.status === 'Active' ? 'bg-green-100 text-green-700' :
                            puzzle.status === 'Upcoming' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                        }`}>
                            {puzzle.status}
                        </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditForm(puzzle)} title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the puzzle for {format(puzzle.puzzleDateGMT, 'PPP')}.
                              Deleting active or past puzzles can affect game data and user experience.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(puzzle.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                              Yes, delete puzzle
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
      </Card>
       <p className="text-xs text-muted-foreground text-center">
            Reminder: Puzzle creation, update, and deletion currently use MOCK (client-side) functions.
            Implement and connect to actual Firebase Cloud Functions for persistence and server-side validation.
          </p>
    </div>
  );
}
