
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';
import { Users, FileText, UserPlus, MessageSquareQuote, ExternalLink, Settings, ListChecks, Eye } from "lucide-react";

export default function AdminDashboardPage() {
  const quickStats = [
    { title: "Active Users (Today)", value: "0", icon: Users, color: "text-blue-500", description: "Mock data" },
    { title: "Words Pending Review", value: "0", icon: FileText, color: "text-orange-500", description: "Awaiting moderation" },
    { title: "New Registrations (Week)", value: "0", icon: UserPlus, color: "text-green-500", description: "Mock data" },
    { title: "Current WotD", value: "---", icon: MessageSquareQuote, color: "text-purple-500", description: "To be set" },
  ];

  const quickLinks = [
    { href: "/admin/words", label: "Moderate Words", icon: ListChecks },
    { href: "/admin/puzzles", label: "Manage Daily Puzzle", icon: Settings },
    { href: "/admin/users", label: "View Users", icon: Eye },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview and quick access to management tasks.</p>
      </div>
      
      <section>
        <h2 className="text-2xl font-semibold mb-4">Quick Stats</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickStats.map((stat) => (
            <Card key={stat.title} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
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
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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
        <h2 className="text-2xl font-semibold mb-4">Recent Activity Log (High-Level)</h2>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Activity</CardTitle>
            <CardDescription>Significant admin actions or system alerts will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No recent activity to display yet.</p>
            {/* Placeholder for activity log items */}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
