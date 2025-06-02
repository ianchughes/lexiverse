
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SystemConfigurationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Manage game-wide parameters and settings. (Administrator Only)
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Game Settings</CardTitle>
          <CardDescription>Adjust core game parameters and feature flags.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Interface for administrators to configure global game settings will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
