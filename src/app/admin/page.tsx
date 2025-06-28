'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';
import { Users, FileText, UserPlus, MessageSquareQuote, ExternalLink, Settings, ListChecks, Eye, AlertCircle, Lightbulb, History } from "lucide-react";
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, Timestamp, limit, orderBy } from 'firebase/firestore';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { DailyPuzzle, MasterWordType, RejectedWordType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";

interface QuickStats {
  activeUsersCount: number | string;
  pendingWordsCount: number | string;
  newRegistrationsCount: number | string;
  currentWotDText: string;
  pendingSuggestionsCount: number | string;
}

interface Activity {
  type: string;
  text: string;
  timestamp: Date | string;
  by: string;
}

export default function AdminDashboardPage() {
    const { currentUser, userRole } = useAuth();
    const [stats, setStats] = useState<QuickStats | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!currentUser || (userRole !== 'admin' && userRole !== 'moderator')) {
            setIsLoading(false);
            return;
        }

        try {
            // Fetch stats
            const todayGMTString = format(new Date(), 'yyyy-MM-dd');
            const activeUsersQuery = query(collection(firestore, "Users"), where("lastPlayedDate_GMT", "==", todayGMTString));
            const pendingWordsQuery = query(collection(firestore, "WordSubmissionsQueue"), where("status", "==", "PendingModeratorReview"));
            const sevenDaysAgoTimestamp = Timestamp.fromDate(subDays(new Date(), 7));
            const newRegistrationsQuery = query(collection(firestore, "Users"), where("dateCreated", ">=", sevenDaysAgoTimestamp));
            const wotdDocRef = doc(firestore, "DailyPuzzles", todayGMTString);
            const pendingSuggestionsQuery = query(collection(firestore, "UserSuggestions"), where("status", "==", "Pending"));

            const [
                activeUsersSnap,
                pendingWordsSnap,
                newRegistrationsSnap,
                wotdDocSnap,
                pendingSuggestionsSnap
            ] = await Promise.all([
                getDocs(activeUsersQuery),
                getDocs(pendingWordsQuery),
                getDocs(newRegistrationsQuery),
                getDoc(wotdDocRef),
                getDocs(pendingSuggestionsQuery)
            ]);

            let wotdText = "Not Set";
            if (wotdDocSnap.exists()) {
                const puzzleData = wotdDocSnap.data() as DailyPuzzle;
                wotdText = puzzleData.wordOfTheDayText || "---";
            }

            setStats({
                activeUsersCount: activeUsersSnap.size,
                pendingWordsCount: pendingWordsSnap.size,
                newRegistrationsCount: newRegistrationsSnap.size,
                currentWotDText: wotdText,
                pendingSuggestionsCount: pendingSuggestionsSnap.size,
            });

            // Fetch recent activities
            let recentActivities: Activity[] = [];
            const approvedQuery = query(collection(firestore, MASTER_WORDS_COLLECTION), orderBy("dateAdded", "desc"), limit(3));
            const rejectedQuery = query(collection(firestore, REJECTED_WORDS_COLLECTION), orderBy("dateRejected", "desc"), limit(2));
            
            const [approvedSnap, rejectedSnap] = await Promise.all([
                getDocs(approvedQuery),
                getDocs(rejectedQuery)
            ]);

            approvedSnap.forEach(docSnap => {
                const data = docSnap.data() as MasterWordType;
                recentActivities.push({
                    type: "Approved",
                    text: data.wordText,
                    timestamp: data.dateAdded instanceof Timestamp ? data.dateAdded.toDate() : new Date(),
                    by: data.addedByUID ? data.addedByUID.substring(0, 6) + "..." : "Admin"
                });
            });

            rejectedSnap.forEach(docSnap => {
                const data = docSnap.data() as RejectedWordType;
                recentActivities.push({
                    type: "Rejected",
                    text: data.wordText,
                    timestamp: data.dateRejected instanceof Timestamp ? data.dateRejected.toDate() : new Date(),
                    by: data.rejectedByUID ? data.rejectedByUID.substring(0, 6) + "..." : "Admin"
                });
            });

            recentActivities.sort((a, b) => {
                const dateA = typeof a.timestamp === 'string' ? new Date(a.timestamp) : a.timestamp;
                const dateB = typeof b.timestamp === 'string' ? new Date(b.timestamp) : b.timestamp;
                return dateB.getTime() - dateA.getTime();
            });
            setActivities(recentActivities.slice(0, 5));

        } catch (error) {
            console.error("Error fetching admin dashboard data:", error);
            setStats({
                activeUsersCount: "Error",
                pendingWordsCount: "Error",
                newRegistrationsCount: "Error",
                currentWotDText: "Error",
                pendingSuggestionsCount: "Error",
            });
            setActivities([{ type: "Error", text: "Could not load recent activities.", timestamp: new Date(), by: "System" }]);
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, userRole]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const quickStats = [
        { title: "Active Users (Today)", value: stats?.activeUsersCount ?? 0, icon: Users, color: "text-blue-500", description: "Users who played today (GMT)" },
        { title: "Words Pending Review", value: stats?.pendingWordsCount ?? 0, icon: FileText, color: "text-orange-500", description: "Awaiting moderation" },
        { title: "Suggestions Pending", value: stats?.pendingSuggestionsCount ?? 0, icon: Lightbulb, color: "text-yellow-500", description: "Feedback awaiting review" },
        { title: "New Registrations (Week)", value: stats?.newRegistrationsCount ?? 0, icon: UserPlus, color: "text-green-500", description: "Joined in last 7 days" },
        { title: "Current WotD", value: stats?.currentWotDText ?? '...', icon: MessageSquareQuote, color: "text-purple-500", description: "Today's Word of the Day" },
    ];
    
    const quickLinks = [
        { href: "/admin/words", label: "Moderate Words", icon: ListChecks },
        { href: "/admin/suggestions", label: "Review Suggestions", icon: Lightbulb },
        { href: "/admin/puzzles", label: "Manage Daily Puzzle", icon: Settings },
        { href: "/admin/users", label: "View Users", icon: Eye },
    ];
    
    if (isLoading) {
        return (
            <div className="space-y-8">
                <div>
                    <Skeleton className="h-9 w-1/2" />
                    <Skeleton className="h-5 w-3/4 mt-2" />
                </div>
                <section>
                    <Skeleton className="h-8 w-1/4 mb-4" />
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
                    </div>
                </section>
                <section>
                    <Skeleton className="h-8 w-1/4 mb-4" />
                    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                </section>
                <section>
                    <Skeleton className="h-8 w-1/3 mb-4" />
                    <Skeleton className="h-48 w-full" />
                </section>
            </div>
        );
    }
    
    if (!currentUser || (userRole !== 'admin' && userRole !== 'moderator')) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><AlertCircle className="text-destructive"/> Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>You do not have permission to view this page. Please log in with an admin or moderator account.</p>
                     <Button asChild className="mt-4"><Link href="/auth/login">Login</Link></Button>
                </CardContent>
            </Card>
        );
    }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview and quick access to management tasks.</p>
      </div>
      
      <section>
        <h2 className="text-2xl font-semibold mb-4">Quick Stats</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {quickStats.map((stat) => (
            <Card key={stat.title} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                {String(stat.value) === "Error" ? <AlertCircle className="h-5 w-5 text-destructive" /> : <stat.icon className={`h-5 w-5 ${stat.color}`} />}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{String(stat.value)}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => (
            <Card key={link.href} className="hover:shadow-md transition-shadow duration-150 ease-in-out">
              <CardContent className="p-0">
                <Link href={link.href} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <link.icon className="h-6 w-6 text-primary" />
                    <span className="text-base font-medium text-primary">{link.label}</span>
                  </div>
                  <ExternalLink className="h-5 w-5 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

       <section>
        <h2 className="text-2xl font-semibold mb-4">Recent Activity Log (Admin Actions)</h2>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Moderation Activity</CardTitle>
            <CardDescription>Last 5 word approvals/rejections.</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent moderation activity.</p>
            ) : (
              <ul className="space-y-3">
                {activities.map((activity, index) => (
                  <li key={index} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                    <div>
                      <span className={`font-semibold ${activity.type === "Approved" ? "text-green-600" : activity.type === "Rejected" ? "text-red-600" : "text-yellow-600"}`}>
                        {activity.type}:
                      </span> {activity.text}
                      <span className="text-xs text-muted-foreground ml-2">(by {activity.by})</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {typeof activity.timestamp === 'string' ? activity.timestamp : format(activity.timestamp, "PPp")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
