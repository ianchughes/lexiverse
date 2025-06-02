
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GameStatisticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Game Statistics & Reporting</h1>
        <p className="text-muted-foreground mt-1">
          View key game metrics, player activity, and performance reports.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Reports Dashboard</CardTitle>
          <CardDescription>Access various game analytics and reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Charts, data visualizations, and exportable reports for game statistics will be available here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
