
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, Eye, AlertTriangle, CheckCircle, MailWarning, Clock } from 'lucide-react';
import { format } from 'date-fns';

const MAIL_LOG_COLLECTION = "mail";
const LOGS_PER_PAGE = 20;

interface MailLogEntry {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  message: {
    subject: string;
    text?: string;
    html?: string;
    messageId?: string;
  };
  delivery?: {
    startTime?: Timestamp;
    endTime?: Timestamp;
    state?: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'RETRY';
    attempts?: number;
    error?: string;
    info?: {
      messageId?: string;
      accepted?: string[];
      rejected?: string[];
      pending?: string[];
      response?: string;
    };
    leaseExpireTime?: Timestamp;
  };
  created?: Timestamp; // If app adds this upon creation
}

export default function MailLogPage() {
  const [mailLogs, setMailLogs] = useState<MailLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmailBody, setSelectedEmailBody] = useState<string | null>(null);
  const [isBodyDialogOpen, setIsBodyDialogOpen] = useState(false);

  const fetchMailLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // The Trigger Email extension adds a `delivery.startTime`. We order by this.
      // If `delivery.startTime` isn't always present immediately, we might need to fall back
      // or ensure our app adds a reliable `createdTimestamp` to sort by.
      // For now, trying with delivery.startTime, but might be an issue for PENDING emails.
      // A more robust solution would be to add a `createdTimestamp` on the mail doc by the app.
      const q = query(
        collection(firestore, MAIL_LOG_COLLECTION),
        orderBy("delivery.startTime", "desc"), // Or a specific 'created' field if you add one
        limit(LOGS_PER_PAGE * 2) // Fetch more to see variety, can be paginated later
      );

      const querySnapshot = await getDocs(q);
      const logs: MailLogEntry[] = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as MailLogEntry));
      
      setMailLogs(logs);
    } catch (err: any) {
      console.error("Error fetching mail logs:", err);
      // If ordering by 'delivery.startTime' fails because it's not set on all docs (e.g., freshly added ones),
      // try fetching without specific ordering or order by a field you know exists.
      if (err.message.includes("orderByField")) {
        try {
          console.warn("Failed to order by delivery.startTime, fetching without specific order.");
          const fallbackQuery = query(collection(firestore, MAIL_LOG_COLLECTION), limit(LOGS_PER_PAGE * 2));
          const fallbackSnapshot = await getDocs(fallbackQuery);
           const logs: MailLogEntry[] = fallbackSnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          } as MailLogEntry));
          // Client-side sort as a fallback
          logs.sort((a, b) => (b.delivery?.startTime?.toMillis() || 0) - (a.delivery?.startTime?.toMillis() || 0));
          setMailLogs(logs);
        } catch (fallbackError: any) {
          console.error("Fallback mail log fetch also failed:", fallbackError);
          setError(fallbackError.message || "Could not fetch mail logs.");
        }
      } else {
        setError(err.message || "Could not fetch mail logs.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMailLogs();
  }, [fetchMailLogs]);

  const getStatusBadge = (state?: MailLogEntry['delivery']['state']) => {
    switch (state) {
      case 'SUCCESS':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Success</Badge>;
      case 'ERROR':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Error</Badge>;
      case 'PENDING':
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'PROCESSING':
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>;
      case 'RETRY':
        return <Badge variant="outline" className="text-orange-500 border-orange-500"><MailWarning className="mr-1 h-3 w-3" />Retry</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatTimestampSafe = (timestamp?: Timestamp): string => {
    if (!timestamp) return 'N/A';
    try {
      return format(timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return 'Invalid Date';
    }
  };
  
  const viewEmailBody = (htmlBody?: string) => {
    setSelectedEmailBody(htmlBody || "No HTML body available.");
    setIsBodyDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mail Log Viewer</h1>
          <p className="text-muted-foreground mt-1">
            View the status of emails processed by the Trigger Email extension.
          </p>
        </div>
        <Button onClick={fetchMailLogs} variant="outline" size="icon" disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Email Send History</CardTitle>
          <CardDescription>
            Shows emails written to the 'mail' collection and their delivery status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading mail logs...</p>
            </div>
          ) : error ? (
             <div className="text-destructive text-center py-10">
              <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
              <p>Error loading mail logs: {error}</p>
            </div>
          ) : mailLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No mail logs found.</p>
          ) : (
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Processed At</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error/Info</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mailLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {formatTimestampSafe(log.delivery?.startTime || log.created)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={log.to.join(', ')}>
                        {log.to.join(', ')}
                      </TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate" title={log.message.subject}>
                        {log.message.subject}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.delivery?.state)}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[300px] truncate" title={log.delivery?.error || log.delivery?.info?.response}>
                        {log.delivery?.error || log.delivery?.info?.response || 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => viewEmailBody(log.message.html)}>
                           <Eye className="mr-1 h-4 w-4" /> View Body
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Displaying last {mailLogs.length} email logs. For more detailed logs, check Firebase Cloud Functions.
          </p>
        </CardFooter>
      </Card>

      <Dialog open={isBodyDialogOpen} onOpenChange={setIsBodyDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Email Body</DialogTitle>
            <DialogDescription>HTML content of the email.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="border rounded-md p-4 bg-secondary/20 h-[60vh]">
            {selectedEmailBody && (
              <div dangerouslySetInnerHTML={{ __html: selectedEmailBody }} />
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBodyDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
