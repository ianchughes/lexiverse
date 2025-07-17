
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { firestore } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore'; // Removed doc, updateDoc
import type { Circle, CircleStatus, UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreHorizontal, Users, ShieldAlert, ShieldCheck, Trash2, Eye, Loader2, RefreshCw, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { adminUpdateCircleStatusAction, adminCreateCircleWithMembersAction } from '@/app/admin/circles/actions';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth

const CIRCLES_PER_PAGE = 15;

export default function CircleManagementPage() {
  const { toast } = useToast();
  const { currentUser: actingAdmin } = useAuth(); // Get current admin
  const [circles, setCircles] = useState<Circle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CircleStatus | 'all'>('all');

  const [circleToUpdate, setCircleToUpdate] = useState<Circle | null>(null);
  const [newStatusForCircle, setNewStatusForCircle] = useState<CircleStatus | null>(null);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // For Create Circle Dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');

  const fetchCircles = useCallback(async () => {
    setIsLoading(true);
    try {
      let q = query(collection(firestore, "Circles"), orderBy("dateCreated", "desc"));
      
      const querySnapshot = await getDocs(q);
      let fetchedCircles: Circle[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Circle));

      if (searchTerm) {
        fetchedCircles = fetchedCircles.filter(c => 
          c.circleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.creatorUserID.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      if (statusFilter !== 'all') {
        fetchedCircles = fetchedCircles.filter(c => c.status === statusFilter);
      }
      
      setCircles(fetchedCircles);
    } catch (error) {
      console.error("Error fetching circles:", error);
      toast({ title: "Error", description: "Could not fetch circles data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, searchTerm, statusFilter]); 

  const fetchAllUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const usersSnap = await getDocs(collection(firestore, "Users"));
      const usersList: UserProfile[] = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      setAllUsers(usersList.sort((a,b) => a.username.localeCompare(b.username)));
    } catch(error) {
       console.error("Error fetching users for circle creation:", error);
       toast({ title: "Error", description: "Could not fetch user list for selection.", variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCircles();
  }, [fetchCircles]);
  
  useEffect(() => {
    if(isCreateDialogOpen) {
      fetchAllUsers();
    }
  }, [isCreateDialogOpen, fetchAllUsers]);

  const getStatusBadge = (status: CircleStatus) => {
    switch (status) {
      case 'Active': return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>;
      case 'Barred_NameIssue': return <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600">Barred (Name)</Badge>;
      case 'Deleted_ByUser': return <Badge variant="secondary">Deleted (User)</Badge>;
      case 'Deleted_ByAdmin': return <Badge variant="destructive">Deleted (Admin)</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openStatusUpdateConfirm = (circle: Circle, newStatus: CircleStatus) => {
    setCircleToUpdate(circle);
    setNewStatusForCircle(newStatus);
    setIsStatusConfirmOpen(true);
  };

  const handleConfirmStatusUpdate = async () => {
    if (!circleToUpdate || !newStatusForCircle || !actingAdmin) {
      toast({ title: "Error", description: "Missing required information or admin not authenticated.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const result = await adminUpdateCircleStatusAction({ 
        circleId: circleToUpdate.id, 
        newStatus: newStatusForCircle,
        actingAdminId: actingAdmin.uid,
        circleName: circleToUpdate.circleName // For logging
      });
      if (result.success) {
        toast({ title: "Status Updated", description: `Circle "${circleToUpdate.circleName}" status changed to ${newStatusForCircle}.` });
        fetchCircles(); 
      } else {
        throw new Error(result.error || "Failed to update status.");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setIsStatusConfirmOpen(false);
      setCircleToUpdate(null);
      setNewStatusForCircle(null);
    }
  };

  const handleToggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleCreateCircle = async () => {
    if (!actingAdmin) return;
    if (!newCircleName.trim()) {
      toast({ title: "Validation Error", description: "Circle name is required.", variant: "destructive"});
      return;
    }
    if (selectedUserIds.size === 0) {
      toast({ title: "Validation Error", description: "Please select at least one member.", variant: "destructive"});
      return;
    }
    setIsProcessing(true);
    try {
      const result = await adminCreateCircleWithMembersAction({
        circleName: newCircleName,
        memberIds: Array.from(selectedUserIds),
        actingAdminId: actingAdmin.uid
      });
      if(result.success) {
        toast({ title: "Circle Created", description: `Circle "${newCircleName}" created successfully.`});
        setIsCreateDialogOpen(false);
        setNewCircleName('');
        setSelectedUserIds(new Set());
        fetchCircles();
      } else {
        throw new Error(result.error || "Failed to create circle.");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const filteredUsers = useMemo(() => {
    if (!userSearchTerm) return allUsers;
    return allUsers.filter(u => 
      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase())
    );
  }, [allUsers, userSearchTerm]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Circle Management</h1>
        <p className="text-muted-foreground mt-1">
          Oversee Lexi Circles, manage memberships, and view circle statistics.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Circles Overview</CardTitle>
              <CardDescription>View, filter, and manage all created circles.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button><PlusCircle className="mr-2 h-4 w-4"/>Create Circle</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create New Circle (Admin)</DialogTitle>
                    <DialogDescription>
                      Create a circle and pre-populate it with members. An email will be sent to all selected members.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="circle-name" className="text-right">Circle Name</Label>
                      <Input id="circle-name" value={newCircleName} onChange={e => setNewCircleName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="space-y-2">
                      <Label>Select Members ({selectedUserIds.size} selected)</Label>
                       <Input 
                        placeholder="Search users..." 
                        value={userSearchTerm} 
                        onChange={e => setUserSearchTerm(e.target.value)}
                        className="mb-2"
                      />
                      <ScrollArea className="h-64 border rounded-md">
                        {isLoadingUsers ? (
                          <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin"/></div>
                        ) : (
                          <div className="p-4 space-y-2">
                            {filteredUsers.map(user => (
                              <div key={user.uid} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                                <Checkbox
                                  id={`user-${user.uid}`}
                                  checked={selectedUserIds.has(user.uid)}
                                  onCheckedChange={() => handleToggleUserSelection(user.uid)}
                                />
                                <Label htmlFor={`user-${user.uid}`} className="flex flex-col">
                                  <span>{user.username}</span>
                                  <span className="text-xs text-muted-foreground">{user.email}</span>
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateCircle} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Create & Invite
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button onClick={fetchCircles} variant="outline" size="icon" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
           <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Input 
              placeholder="Search by Name, ID, Creator UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
              suppressHydrationWarning={true}
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CircleStatus | 'all')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Barred_NameIssue">Barred (Name)</SelectItem>
                <SelectItem value="Deleted_ByUser">Deleted (User)</SelectItem>
                <SelectItem value="Deleted_ByAdmin">Deleted (Admin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading circles...</p>
            </div>
          ) : circles.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">
              No circles found{searchTerm || statusFilter !== 'all' ? ' matching your filters' : ''}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Creator UID</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Public</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circles.map((circle) => (
                  <TableRow key={circle.id}>
                    <TableCell className="font-medium text-primary">{circle.circleName}</TableCell>
                    <TableCell className="font-mono text-xs" title={circle.id}>{circle.id.substring(0,8)}...</TableCell>
                    <TableCell className="font-mono text-xs" title={circle.creatorUserID}>{circle.creatorUserID.substring(0,8)}...</TableCell>
                    <TableCell>{circle.memberCount}</TableCell>
                    <TableCell>{format(circle.dateCreated.toDate(), 'PP')}</TableCell>
                    <TableCell>{circle.isPublic ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{getStatusBadge(circle.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isProcessing && circleToUpdate?.id === circle.id}>
                            {isProcessing && circleToUpdate?.id === circle.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions for {circle.circleName}</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/circles/${circle.id}`}><Eye className="mr-2 h-4 w-4" />View/Edit Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openStatusUpdateConfirm(circle, 'Active')} disabled={circle.status === 'Active'}>
                            <ShieldCheck className="mr-2 h-4 w-4 text-green-500"/>Set Active
                          </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => openStatusUpdateConfirm(circle, 'Barred_NameIssue')} disabled={circle.status === 'Barred_NameIssue'}>
                            <ShieldAlert className="mr-2 h-4 w-4 text-orange-500"/>Set Barred (Name Issue)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openStatusUpdateConfirm(circle, 'Deleted_ByAdmin')} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4"/>Set Deleted (By Admin)
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
            <p className="text-xs text-muted-foreground">Displaying {circles.length} circles.</p>
        </CardFooter>
      </Card>

       {circleToUpdate && newStatusForCircle && (
        <AlertDialog open={isStatusConfirmOpen} onOpenChange={setIsStatusConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to change the status of circle "{circleToUpdate.circleName}" to "{newStatusForCircle}"?
                {newStatusForCircle === 'Barred_NameIssue' && " This will notify the creator and may restrict circle functionality."}
                {newStatusForCircle === 'Deleted_ByAdmin' && " This is a soft delete. The circle will be marked as deleted."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessing} onClick={() => setIsStatusConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmStatusUpdate} disabled={isProcessing} 
                className={newStatusForCircle.startsWith('Deleted') || newStatusForCircle.startsWith('Barred') ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
