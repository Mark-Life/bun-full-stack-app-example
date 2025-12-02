import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ClientNavProfilePage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="mb-2 font-bold text-3xl">Profile</h2>
        <p className="text-muted-foreground">
          View and manage your profile information.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium text-muted-foreground text-sm">Name</p>
              <p className="text-lg">John Doe</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-sm">Email</p>
              <p className="text-lg">john@example.com</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-sm">
                Member Since
              </p>
              <p className="text-lg">January 2024</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-sm">Role</p>
              <p className="text-lg">Administrator</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
            <CardDescription>Your profile picture</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-muted font-bold text-4xl text-muted-foreground">
                JD
              </div>
            </div>
            <p className="mt-4 text-center text-muted-foreground text-sm">
              Click to upload a new avatar
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Total Logins</span>
              <span className="font-semibold">1,234</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Last Login</span>
              <span className="font-semibold">2 hours ago</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Status</span>
              <span className="font-semibold text-primary">Active</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
