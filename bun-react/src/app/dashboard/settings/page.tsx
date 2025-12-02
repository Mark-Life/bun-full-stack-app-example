import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardSettings() {
  return (
    <div className="grid w-full gap-6">
      <div>
        <h2 className="mb-2 font-bold text-3xl">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>Update your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label
              className="mb-2 block font-medium text-sm"
              htmlFor="display-name"
            >
              Display Name
            </label>
            <input
              className="w-full rounded-md border border-input px-3 py-2"
              defaultValue="John Doe"
              type="text"
            />
          </div>
          <div>
            <label className="mb-2 block font-medium text-sm" htmlFor="email">
              Email
            </label>
            <input
              className="w-full rounded-md border border-input px-3 py-2"
              defaultValue="john@example.com"
              type="email"
            />
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Configure notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-muted-foreground text-sm">
                Receive email updates
              </p>
            </div>
            <input className="h-4 w-4" defaultChecked type="checkbox" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Push Notifications</p>
              <p className="text-muted-foreground text-sm">
                Receive push notifications
              </p>
            </div>
            <input className="h-4 w-4" type="checkbox" />
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Client Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            You navigated here using client-side navigation! Notice how the page
            didn&apos;t reload and the navigation bar persisted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
