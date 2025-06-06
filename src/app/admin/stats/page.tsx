
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { firestore } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { subDays, format } from 'date-fns';
import { Users, FileText, UsersRound, BarChartBig, Activity, UserCheck, CheckSquare, CircleDot } from "lucide-react";

async function getStatisticsData() {
  try {
    // Total Registered Users
    const usersSnap = await getDocs(collection(firestore, "Users"));
    const totalRegisteredUsers = usersSnap.size;

    // Users Played Today
    const todayGMTString = format(new Date(), 'yyyy-MM-dd');
    const playedTodayQuery = query(collection(firestore, "Users"), where("lastPlayedDate_GMT", "==", todayGMTString));
    const playedTodaySnap = await getDocs(playedTodayQuery);
    const usersPlayedToday = playedTodaySnap.size;

    // New Users (Last 7 Days)
    const sevenDaysAgo = Timestamp.fromDate(subDays(new Date(), 7));
    const newUsers7DaysQuery = query(collection(firestore, "Users"), where("dateCreated", ">=", sevenDaysAgo));
    const newUsers7DaysSnap = await getDocs(newUsers7DaysQuery);
    const newUsersLast7Days = newUsers7DaysSnap.size;

    // New Users (Last 30 Days)
    const thirtyDaysAgo = Timestamp.fromDate(subDays(new Date(), 30));
    const newUsers30DaysQuery = query(collection(firestore, "Users"), where("dateCreated", ">=", thirtyDaysAgo));
    const newUsers30DaysSnap = await getDocs(newUsers30DaysQuery);
    const newUsersLast30Days = newUsers30DaysSnap.size;
    
    // Total Words in Master Dictionary
    const masterWordsSnap = await getDocs(collection(firestore, "Words"));
    const totalMasterWords = masterWordsSnap.size;

    // Total Words Claimed and Awaiting Moderation
    const pendingReviewQuery = query(collection(firestore, "WordSubmissionsQueue"), where("status", "==", "PendingModeratorReview"));
    const pendingReviewSnap = await getDocs(pendingReviewQuery);
    const totalPendingWords = pendingReviewSnap.size;

    // Total Circles Created
    const circlesSnap = await getDocs(collection(firestore, "Circles"));
    const totalCirclesCreated = circlesSnap.size;
    
    // Total Circle Memberships (sum of all members in all circles)
    const circleMembersSnap = await getDocs(collection(firestore, "CircleMembers"));
    const totalCircleMemberships = circleMembersSnap.size;


    return {
      totalRegisteredUsers,
      usersPlayedToday,
      newUsersLast7Days,
      newUsersLast30Days,
      totalMasterWords,
      totalPendingWords,
      totalCirclesCreated,
      totalCircleMemberships,
      error: null,
    };

  } catch (error: any) {
    console.error("Error fetching statistics data:", error);
    return {
      totalRegisteredUsers: 0,
      usersPlayedToday: 0,
      newUsersLast7Days: 0,
      newUsersLast30Days: 0,
      totalMasterWords: 0,
      totalPendingWords: 0,
      totalCirclesCreated: 0,
      totalCircleMemberships: 0,
      error: error.message || "Failed to load statistics.",
    };
  }
}


export default async function GameStatisticsPage() {
  const stats = await getStatisticsData();

  const statCards = [
    { title: "Total Registered Users", value: stats.totalRegisteredUsers, icon: Users, description: "All users who have ever signed up." },
    { title: "Users Played Today (GMT)", value: stats.usersPlayedToday, icon: UserCheck, description: "Unique users active in today's puzzle." },
    { title: "New Users (Last 7 Days)", value: stats.newUsersLast7Days, icon: Activity, description: "Sign-ups in the past week." },
    { title: "New Users (Last 30 Days)", value: stats.newUsersLast30Days, icon: BarChartBig, description: "Sign-ups in the past month." },
    { title: "Words in Dictionary", value: stats.totalMasterWords, icon: FileText, description: "Total approved words available." },
    { title: "Words Claimed & Awaiting Moderation", value: stats.totalPendingWords, icon: CheckSquare, description: "Submissions awaiting moderation." },
    { title: "Total Circles Created", value: stats.totalCirclesCreated, icon: UsersRound, description: "All circles initiated by users." },
    { title: "Total Circle Memberships", value: stats.totalCircleMemberships, icon: CircleDot, description: "Sum of members across all circles." },
  ];
  
  const averageMembersPerCircle = stats.totalCirclesCreated > 0 ? (stats.totalCircleMemberships / stats.totalCirclesCreated).toFixed(1) : "N/A";


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Game Statistics & Reporting</h1>
        <p className="text-muted-foreground mt-1">
          View key game metrics, player activity, and performance reports.
        </p>
      </div>

      {stats.error && (
        <Card className="bg-destructive/10 border-destructive text-destructive-foreground">
          <CardHeader>
            <CardTitle>Error Loading Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{stats.error} Please try refreshing the page or check the server logs.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.error ? "N/A" : stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Members Per Circle</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.error ? "N/A" : averageMembersPerCircle}</div>
              <p className="text-xs text-muted-foreground">Calculated average of members.</p>
            </CardContent>
          </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>More Analytics Coming Soon!</CardTitle>
          <CardDescription>
            We're working on adding more detailed reports, including charts for trends over time, player retention metrics, and detailed circle engagement data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Future enhancements will include:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground pl-4 mt-2 space-y-1">
            <li>Daily/Weekly/Monthly Active Users (DAU/WAU/MAU) charts.</li>
            <li>Word of the Day success rate trends.</li>
            <li>Average words found per session trends.</li>
            <li>Player cohort analysis for retention.</li>
            <li>Top performing circles and engagement heatmaps.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

