import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardAnalytics() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="mb-2 font-bold text-3xl">Analytics</h2>
        <p className="text-muted-foreground">
          View your analytics and performance metrics.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Page Views</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-3xl">45,231</p>
            <p className="text-primary text-sm">+12.5% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Unique Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-3xl">12,345</p>
            <p className="text-primary text-sm">+8.2% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bounce Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-3xl">32.1%</p>
            <p className="text-destructive text-sm">-2.3% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Avg. Session</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-3xl">4:32</p>
            <p className="text-primary text-sm">+15s from last month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Traffic Sources</CardTitle>
          <CardDescription>Where your visitors come from</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between">
                <span className="font-medium text-sm">Direct</span>
                <span className="text-muted-foreground text-sm">45%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: "45%" }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="font-medium text-sm">Search Engines</span>
                <span className="text-muted-foreground text-sm">30%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: "30%" }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="font-medium text-sm">Social Media</span>
                <span className="text-muted-foreground text-sm">15%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: "15%" }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="font-medium text-sm">Referrals</span>
                <span className="text-muted-foreground text-sm">10%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: "10%" }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navigation Demo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            This page was loaded via client-side navigation. Try using the
            browser&apos;s back button - it will navigate back without a page
            reload!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
