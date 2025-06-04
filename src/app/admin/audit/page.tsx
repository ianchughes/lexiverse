
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { AdminAuditLogEntry, UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

const LOGS_PER_PAGE = 20;
const ADMIN_AUDIT_LOGS_COLLECTION = "AdminAuditLogs";
const USERS_COLLECTION = "Users";

export default function AuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [adminUsernames, setAdminUsernames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchAdminUsernames = useCallback(async (adminIds: string[]) => {
    if (adminIds.length === 0) return;
    const newAdminUsernames = { ...adminUsernames };
    const idsToFetch = adminIds.filter(id => !newAdminUsernames[id]);

    if (idsToFetch.length === 0) return;

    try {
      // Firestore 'in' query supports up to 30 elements per query
      for (let i = 0; i < idsToFetch.length; i += 30) {
        const batchIds = idsToFetch.slice(i, i + 30);
        const usersQuery = query(collection(firestore, USERS_COLLECTION), where('uid', 'in', batchIds));
        const usersSnap = await getDocs(usersQuery);
        usersSnap.forEach(docSnap => {
          const userData = docSnap.data() as UserProfile;
          newAdminUsernames[userData.uid] = userData.username || userData.uid;
        });
      }
      setAdminUsernames(newAdminUsernames);
    } catch (error) {
      console.error("Error fetching admin usernames:", error);
    }
  }, [adminUsernames]);

  const fetchAuditLogs = useCallback(async (loadMore = false) => {
    setIsLoading(true);
    try {
      let q = query(
        collection(firestore, ADMIN_AUDIT_LOGS_COLLECTION),
        orderBy("timestamp", "desc"),
        limit(LOGS_PER_PAGE)
      );

      if (loadMore && lastVisible) {
        q = query(
          collection(firestore, ADMIN_AUDIT_LOGS_COLLECTION),
          orderBy("timestamp", "desc"),
          startAfter(lastVisible),
          limit(LOGS_PER_PAGE)
        );
      }

      const querySnapshot = await getDocs(q);
      const logs: AdminAuditLogEntry[] = [];
      querySnapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as AdminAuditLogEntry);
      });

      setAuditLogs(prevLogs => loadMore ? [...prevLogs, ...logs] : logs);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === LOGS_PER_PAGE);

      const adminIdsFromLogs = Array.from(new Set(logs.map(log => log.actingAdminId)));
      fetchAdminUsernames(adminIdsFromLogs);

    } catch (error) {
      console.error("Error fetching audit logs:", error);
      // Consider adding a toast notification here
    } finally {
      setIsLoading(false);
    }
  }, [lastVisible, fetchAdminUsernames]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]); // Initial fetch

  const formatDetails = (details: string | object | undefined): string => {
    if (typeof details === 'string') return details;
    if (typeof details === 'object' && details !== null) return JSON.stringify(details);
    return 'N/A';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">
          Track significant actions performed within the Admin Panel.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Chronological record of administrative actions.</CardDescription>
          </div>
          <Button onClick={() => fetchAuditLogs()} variant="outline" size="icon" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && auditLogs.length === 0 ? (
             <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading audit logs...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No audit logs found.</p>
          ) : (
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action Type</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {log.timestamp ? format(log.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : 'N/A'}
                      </TableCell>
                      <TableCell>{adminUsernames[log.actingAdminId] || log.actingAdminId.substring(0,8)+'...'}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.actionType}
                        </span>
                      </TableCell>
                      <TableCell>
                        {log.targetEntityDisplay || log.targetEntityId || 'N/A'}
                        {log.targetEntityType && <span className="text-xs text-muted-foreground ml-1">({log.targetEntityType})</span>}
                      </TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={formatDetails(log.details)}>
                        {formatDetails(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          {hasMore && !isLoading && auditLogs.length > 0 && (
            <div className="mt-4 text-center">
              <Button onClick={() => fetchAuditLogs(true)} variant="outline" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Logs
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
