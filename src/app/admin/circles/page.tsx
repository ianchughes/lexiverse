
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { firestore } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore'; // Removed doc, updateDoc
import type { Circle, CircleStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreHorizontal, Users, ShieldAlert, ShieldCheck, Trash2, Eye, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { adminUpdateCircleStatusAction } from '@/app/admin/circles/actions';
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

  useEffect(() => {
    fetchCircles();
  }, [fetchCircles]);

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
            <Button onClick={fetchCircles} variant="outline" size="icon" disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
           <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Input 
              placeholder="Search by Name, ID, Creator UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
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
