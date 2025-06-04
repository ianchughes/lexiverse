
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';
import { Users, FileText, UserPlus, MessageSquareQuote, ExternalLink, Settings, ListChecks, Eye, AlertCircle, Lightbulb } from "lucide-react"; // Added Lightbulb
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, Timestamp, limit, orderBy } from 'firebase/firestore';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { DailyPuzzle, UserProfile, WordSubmission, UserSuggestionLog } from '@/types'; // Added UserSuggestionLog

async function getQuickStatsData() {
  try {
    // 1. Active Users (Today)
    const todayStart = startOfDay(new Date()); // Local start of today
    const todayEnd = endOfDay(new Date());     // Local end of today

    // Assuming lastPlayedDate_GMT is stored as a Firestore Timestamp
    // We need to query for users whose lastPlayedDate_GMT falls within today (GMT)
    // For simplicity, we'll query for a specific date string if that's how it's stored,
    // or adjust if it's a full timestamp. Let's assume it's a Timestamp for now.
    // Firestore timestamps are timezone-agnostic (UTC). If puzzles are GMT-based,
    // we should align our query with GMT midnight to GMT midnight.
    
    // For "Active Users Today" based on lastPlayedDate_GMT (assuming it's a string 'YYYY-MM-DD')
    const todayGMTString = format(new Date(), 'yyyy-MM-dd');
    const activeUsersQuery = query(collection(firestore, "Users"), where("lastPlayedDate_GMT", "==", todayGMTString));
    const activeUsersSnap = await getDocs(activeUsersQuery);
    const activeUsersCount = activeUsersSnap.size;

    // 2. Words Pending Review
    const pendingWordsQuery = query(collection(firestore, "WordSubmissionsQueue"), where("status", "==", "PendingModeratorReview"));
    const pendingWordsSnap = await getDocs(pendingWordsQuery);
    const pendingWordsCount = pendingWordsSnap.size;

    // 3. New Registrations (Week)
    const sevenDaysAgo = subDays(new Date(), 7);
    const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);
    const newRegistrationsQuery = query(collection(firestore, "Users"), where("dateCreated", ">=", sevenDaysAgoTimestamp));
    const newRegistrationsSnap = await getDocs(newRegistrationsQuery);
    const newRegistrationsCount = newRegistrationsSnap.size;

    // 4. Current WotD
    const todayPuzzleId = format(new Date(), 'yyyy-MM-dd'); // Assumes puzzle IDs are 'YYYY-MM-DD'
    const wotdDocRef = doc(firestore, "DailyPuzzles", todayPuzzleId);
    const wotdDocSnap = await getDoc(wotdDocRef);
    let currentWotDText = "Not Set";
    if (wotdDocSnap.exists()) {
      const puzzleData = wotdDocSnap.data() as DailyPuzzle;
      currentWotDText = puzzleData.wordOfTheDayText || "---";
    }

    // 5. Suggestions Pending Moderation
    const pendingSuggestionsQuery = query(collection(firestore, "UserSuggestions"), where("status", "==", "Pending"));
    const pendingSuggestionsSnap = await getDocs(pendingSuggestionsQuery);
    const pendingSuggestionsCount = pendingSuggestionsSnap.size;


    return {
      activeUsersCount,
      pendingWordsCount,
      newRegistrationsCount,
      currentWotDText,
      pendingSuggestionsCount, // Added new stat
    };

  } catch (error) {
    console.error("Error fetching quick stats:", error);
    return {
      activeUsersCount: "Error",
      pendingWordsCount: "Error",
      newRegistrationsCount: "Error",
      currentWotDText: "Error",
      pendingSuggestionsCount: "Error", // Added new stat error state
    };
  }
}


export default async function AdminDashboardPage() {
  const statsData = await getQuickStatsData();

  const quickStats = [
    { title: "Active Users (Today)", value: String(statsData.activeUsersCount), icon: Users, color: "text-blue-500", description: "Users who played today (GMT)" },
    { title: "Words Pending Review", value: String(statsData.pendingWordsCount), icon: FileText, color: "text-orange-500", description: "Awaiting moderation" },
    { title: "Suggestions Pending", value: String(statsData.pendingSuggestionsCount), icon: Lightbulb, color: "text-yellow-500", description: "Feedback awaiting review" },
    { title: "New Registrations (Week)", value: String(statsData.newRegistrationsCount), icon: UserPlus, color: "text-green-500", description: "Joined in last 7 days" },
    { title: "Current WotD", value: statsData.currentWotDText, icon: MessageSquareQuote, color: "text-purple-500", description: "Today's Word of the Day" },
  ];

  const quickLinks = [
    { href: "/admin/words", label: "Moderate Words", icon: ListChecks },
    { href: "/admin/suggestions", label: "Review Suggestions", icon: Lightbulb }, // Updated link or add new
    { href: "/admin/puzzles", label: "Manage Daily Puzzle", icon: Settings },
    { href: "/admin/users", label: "View Users", icon: Eye },
  ];

  // Fetch recent activity (simplified - last 5 approved/rejected words)
  let recentActivities: { type: string, text: string, timestamp: Date | string, by: string }[] = [];
  try {
    // Fetch last 3 approved words from MasterWords, ordered by dateAdded
    const approvedQuery = query(collection(firestore, MASTER_WORDS_COLLECTION), orderBy("dateAdded", "desc"), limit(3));
    const approvedSnap = await getDocs(approvedQuery);
    approvedSnap.forEach(docSnap => {
      const data = docSnap.data() as MasterWordType;
      recentActivities.push({ 
        type: "Approved", 
        text: data.wordText, 
        timestamp: data.dateAdded instanceof Timestamp ? data.dateAdded.toDate() : new Date(), 
        by: data.addedByUID ? data.addedByUID.substring(0,6) + "..." : "Admin"
      });
    });

    // Fetch last 2 rejected words from RejectedWords, ordered by dateRejected
    const rejectedQuery = query(collection(firestore, REJECTED_WORDS_COLLECTION), orderBy("dateRejected", "desc"), limit(2));
    const rejectedSnap = await getDocs(rejectedQuery);
    rejectedSnap.forEach(docSnap => {
      const data = docSnap.data() as RejectedWordType;
      recentActivities.push({ 
        type: "Rejected", 
        text: data.wordText, 
        timestamp: data.dateRejected instanceof Timestamp ? data.dateRejected.toDate() : new Date(), 
        by: data.rejectedByUID ? data.rejectedByUID.substring(0,6) + "..." : "Admin"
      });
    });
    
    // Sort all activities by timestamp descending
    recentActivities.sort((a, b) => {
        const dateA = typeof a.timestamp === 'string' ? new Date(a.timestamp) : a.timestamp;
        const dateB = typeof b.timestamp === 'string' ? new Date(b.timestamp) : b.timestamp;
        return dateB.getTime() - dateA.getTime();
    });
    recentActivities = recentActivities.slice(0, 5); // Ensure we only show top 5 combined

  } catch (error) {
    console.error("Error fetching recent activities:", error);
    recentActivities = [{ type: "Error", text: "Could not load recent activities.", timestamp: new Date(), by: "System" }];
  }


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview and quick access to management tasks.</p>
      </div>
      
      <section>
        <h2 className="text-2xl font-semibold mb-4">Quick Stats</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"> {/* Adjusted grid for potentially 5 items */}
          {quickStats.map((stat) => (
            <Card key={stat.title} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                {stat.value === "Error" ? <AlertCircle className="h-5 w-5 text-destructive" /> : <stat.icon className={`h-5 w-5 ${stat.color}`} />}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4"> {/* Adjusted grid for quick links */}
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
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent moderation activity.</p>
            ) : (
              <ul className="space-y-3">
                {recentActivities.map((activity, index) => (
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

const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";

interface MasterWordType {
  wordText: string;
  definition: string;
  frequency: number;
  status: 'Approved' | 'SystemInitial';
  addedByUID: string;
  dateAdded: Timestamp; // Firestore Timestamp
  originalSubmitterUID?: string;
  puzzleDateGMTOfSubmission?: string;
}

interface RejectedWordType {
  wordText: string;
  rejectionType: 'Gibberish' | 'AdminDecision';
  rejectedByUID: string;
  dateRejected: Timestamp; // Firestore Timestamp
  originalSubmitterUID?: string;
}
