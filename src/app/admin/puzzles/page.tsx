
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DailyPuzzleManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daily Puzzle Management</h1>
        <p className="text-muted-foreground mt-1">
          Create, edit, and manage daily puzzles, including Word of the Day and seeding letters.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Puzzle Configuration</CardTitle>
          <CardDescription>Define upcoming daily challenges for players.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Detailed forms and listings for daily puzzles will be implemented here.
            This includes setting the Word of the Day, seeding letters, and managing puzzle schedules.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
