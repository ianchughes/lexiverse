
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WordManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Word Management & Moderation</h1>
        <p className="text-muted-foreground mt-1">
          Manage the master game dictionary and moderate user-submitted words.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Word Submissions Queue</CardTitle>
          <CardDescription>Review and approve/reject words submitted by players.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Interface for moderators and administrators to process new word submissions will be here.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Master Game Dictionary</CardTitle>
          <CardDescription>View and manage all approved words in the game.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tools for administrators to manage the core dictionary of the game.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
