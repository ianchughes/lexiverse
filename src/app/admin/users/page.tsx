
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import type { UserProfile, AdminRoleDoc, UserRole, AccountStatus, UserProfileWithRole, MasterWordType } from '@/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import { MoreHorizontal, UserCog, UserCheck, UserX, ShieldCheck, ShieldOff, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';

const MASTER_WORDS_COLLECTION = "Words"; 

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfileWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedUser, setSelectedUser] = useState<UserProfileWithRole | null>(null);
  const [actionType, setActionType] = useState<'changeRole' | 'changeStatus' | null>(null);
  const [newRole, setNewRole] = useState<UserRole | null>(null);
  const [newStatus, setNewStatus] = useState<AccountStatus | null>(null);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);

  const [showOwnedWordsDialog, setShowOwnedWordsDialog] = useState(false);
  const [selectedUserForWords, setSelectedUserForWords] = useState<UserProfileWithRole | null>(null);

  const fetchUsersAndRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(firestore, "Users"));
      const fetchedUsers: UserProfile[] = usersSnapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));

      const adminRolesSnapshot = await getDocs(collection(firestore, "admin_users"));
      const adminRolesMap = new Map<string, UserRole>();
      adminRolesSnapshot.forEach(d => {
        const roleData = d.data() as AdminRoleDoc;
        adminRolesMap.set(d.id, roleData.role);
      });

      const masterWordsSnapshot = await getDocs(collection(firestore, MASTER_WORDS_COLLECTION));
      const wordsByOwner = new Map<string, string[]>();
      masterWordsSnapshot.forEach(docSnap => {
        const wordData = docSnap.data() as MasterWordType;
        if (wordData.originalSubmitterUID) {
          if (!wordsByOwner.has(wordData.originalSubmitterUID)) {
            wordsByOwner.set(wordData.originalSubmitterUID, []);
          }
          wordsByOwner.get(wordData.originalSubmitterUID)!.push(wordData.wordText);
        }
      });

      const usersWithRolesData: UserProfileWithRole[] = fetchedUsers.map(user => {
        const ownedWordsList = wordsByOwner.get(user.uid) || [];
        return {
          ...user,
          role: adminRolesMap.get(user.uid) || 'user',
          ownedWordsCount: ownedWordsList.length,
          ownedWords: ownedWordsList,
        };
      });

      setUsers(usersWithRolesData);
    } catch (error) {
      console.error("Error fetching users, roles, and words:", error);
      toast({ title: "Error", description: "Could not fetch user and word data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsersAndRoles();
  }, [fetchUsersAndRoles]);

  const openConfirmationDialog = (user: UserProfileWithRole, type: 'changeRole' | 'changeStatus', value: UserRole | AccountStatus) => {
    setSelectedUser(user);
    setActionType(type);
    if (type === 'changeRole') setNewRole(value as UserRole);
    if (type === 'changeStatus') setNewStatus(value as AccountStatus);
    setIsAlertDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedUser || !actionType) return;

    try {
      if (actionType === 'changeRole' && newRole) {
        const userDocRef = doc(firestore, "admin_users", selectedUser.uid);
        if (newRole === 'admin' || newRole === 'moderator') {
          await setDoc(userDocRef, { role: newRole });
        } else { // Demoting to 'user'
          await deleteDoc(userDocRef);
        }
        toast({ title: "Success", description: `${selectedUser.username}'s role updated to ${newRole}.` });
      } else if (actionType === 'changeStatus' && newStatus) {
        const userDocRef = doc(firestore, "Users", selectedUser.uid);
        await updateDoc(userDocRef, { accountStatus: newStatus });
        toast({ title: "Success", description: `${selectedUser.username}'s status updated to ${newStatus}.` });
      }
      fetchUsersAndRoles(); 
    } catch (error) {
      console.error("Error updating user:", error);
      toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
    } finally {
      setIsAlertDialogOpen(false);
      setSelectedUser(null);
      setActionType(null);
    }
  };
  
  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin': return <Badge variant="destructive" className="items-center gap-1"><ShieldCheck className="h-3 w-3"/>Admin</Badge>;
      case 'moderator': return <Badge variant="secondary" className="items-center gap-1"><UserCog className="h-3 w-3"/>Moderator</Badge>;
      default: return <Badge variant="outline">User</Badge>;
    }
  };

  const getStatusBadge = (status: AccountStatus) => {
    switch (status) {
      case 'Active': return <Badge className="bg-green-500 hover:bg-green-600 items-center gap-1"><UserCheck className="h-3 w-3"/>Active</Badge>;
      case 'Blocked': return <Badge variant="destructive" className="items-center gap-1"><UserX className="h-3 w-3"/>Blocked</Badge>;
      case 'PendingVerification': return <Badge variant="secondary" className="items-center gap-1">Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleShowOwnedWords = (user: UserProfileWithRole) => {
    setSelectedUserForWords(user);
    setShowOwnedWordsDialog(true);
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.uid.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground mt-1">
          View user details, manage account status, roles, scores, and owned words.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>Search, filter, and manage all registered players.</CardDescription>
           <div className="pt-4">
            <Input 
              placeholder="Search by UID, Username, or Email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-muted-foreground">No users found{searchTerm ? ' matching your search' : ''}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Owned Words</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-mono text-xs" title={user.uid}>{user.uid.substring(0,8)}...</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.overallPersistentScore}</TableCell>
                    <TableCell>
                      {user.ownedWordsCount !== undefined && user.ownedWordsCount > 0 ? (
                        <Button variant="link" className="p-0 h-auto text-primary" onClick={() => handleShowOwnedWords(user)}>
                          {user.ownedWordsCount} <Star className="h-3 w-3 ml-1 fill-amber-400 text-amber-500"/>
                        </Button>
                      ) : (
                        user.ownedWordsCount !== undefined ? user.ownedWordsCount : 'N/A'
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(user.accountStatus)}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      {user.dateCreated instanceof Timestamp 
                        ? user.dateCreated.toDate().toLocaleDateString()
                        : user.dateCreated?.seconds 
                        ? new Date(user.dateCreated.seconds * 1000).toLocaleDateString()
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions for {user.username}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Set Role</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openConfirmationDialog(user, 'changeRole', 'admin')} disabled={user.role === 'admin'}>
                            <ShieldCheck className="mr-2 h-4 w-4" /> Make Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openConfirmationDialog(user, 'changeRole', 'moderator')} disabled={user.role === 'moderator'}>
                             <UserCog className="mr-2 h-4 w-4" /> Make Moderator
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openConfirmationDialog(user, 'changeRole', 'user')} disabled={user.role === 'user'}>
                             <ShieldOff className="mr-2 h-4 w-4" /> Make User (Remove Admin/Mod)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Set Status</DropdownMenuLabel>
                           <DropdownMenuItem onClick={() => openConfirmationDialog(user, 'changeStatus', 'Active')} disabled={user.accountStatus === 'Active'}>
                            <UserCheck className="mr-2 h-4 w-4" /> Set Active
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openConfirmationDialog(user, 'changeStatus', 'Blocked')} disabled={user.accountStatus === 'Blocked'}>
                            <UserX className="mr-2 h-4 w-4" /> Set Blocked
                          </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => openConfirmationDialog(user, 'changeStatus', 'PendingVerification')} disabled={user.accountStatus === 'PendingVerification'}>
                            Set Pending Verification
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
      </Card>

      {selectedUser && (
        <AlertDialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Action</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to 
                {actionType === 'changeRole' && ` change ${selectedUser.username}'s role to ${newRole}`}
                {actionType === 'changeStatus' && ` change ${selectedUser.username}'s status to ${newStatus}`}?
                This action can impact user access and permissions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsAlertDialogOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmAction} className={ (actionType === 'changeRole' && newRole !== 'user') || (actionType === 'changeStatus' && newStatus === 'Blocked') ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}>
                Yes, Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {selectedUserForWords && (
        <Dialog open={showOwnedWordsDialog} onOpenChange={setShowOwnedWordsDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Words Owned by {selectedUserForWords.username}</DialogTitle>
              <DialogDescription>
                This user was the original submitter for the following words:
              </DialogDescription>
            </DialogHeader>
            {selectedUserForWords.ownedWords && selectedUserForWords.ownedWords.length > 0 ? (
              <ScrollArea className="h-60 my-4 border rounded-md p-2">
                <ul className="space-y-1">
                  {selectedUserForWords.ownedWords.map(word => (
                    <li key={word} className="text-sm p-1 bg-muted/50 rounded-sm">{word}</li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <p className="my-4 text-muted-foreground">This user has not claimed any words yet.</p>
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
            User role and status changes are made directly to Firestore. Owned words data is fetched from the 'Words' collection.
        </p>
    </div>
  );
}
