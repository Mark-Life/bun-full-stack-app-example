import { type FormEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { clientComponent } from "~/framework/shared/rsc";

const APITester = clientComponent(() => {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const endpoint = formData.get("endpoint") as string;
      const url = new URL(endpoint, location.href);
      const method = formData.get("method") as string;

      const fetchOptions: RequestInit = { method };

      // Add body for PUT/POST/PATCH
      if (["PUT", "POST", "PATCH"].includes(method)) {
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify({ name: "Test" });
      }

      const res = await fetch(url, fetchOptions);

      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await res.json();
        if (responseInputRef.current) {
          responseInputRef.current.value = JSON.stringify(data, null, 2);
        }
      } else {
        const text = await res.text();
        if (responseInputRef.current) {
          responseInputRef.current.value = `Status: ${res.status}\n\n${text}`;
        }
      }
    } catch (error) {
      if (responseInputRef.current) {
        responseInputRef.current.value = String(error);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form className="flex items-center gap-2" onSubmit={testEndpoint}>
        <Label className="sr-only" htmlFor="method">
          Method
        </Label>
        <Select defaultValue="GET" name="method">
          <SelectTrigger className="w-[100px]" id="method">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
        <Label className="sr-only" htmlFor="endpoint">
          Endpoint
        </Label>
        <Input
          defaultValue="/api/hello"
          id="endpoint"
          name="endpoint"
          placeholder="/api/hello"
          type="text"
        />
        <Button type="submit">Send</Button>
      </form>
      <Label className="sr-only" htmlFor="response">
        Response
      </Label>
      <Textarea
        className="min-h-[200px] resize-y font-mono text-sm"
        id="response"
        placeholder="Response will appear here..."
        readOnly
        ref={responseInputRef}
      />
    </div>
  );
});

export default function APIDemoPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 font-bold text-4xl">Typesafe API Routes</h1>
        <p className="text-lg text-muted-foreground">
          End-to-end type safety from server to client. Define routes with Zod
          schemas and get full type inference.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Tester</CardTitle>
          <CardDescription>
            Test API endpoints with full type safety
          </CardDescription>
        </CardHeader>
        <CardContent>
          <APITester />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Typesafe APIs Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
            <li>
              Define routes with Zod schemas for params, query, body, and
              response
            </li>
            <li>
              Compose routes into an API object using{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                createAPI()
              </code>
            </li>
            <li>
              Generate typesafe client with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                apiClient
              </code>
            </li>
            <li>
              Use the client in components - all types are inferred
              automatically
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Code Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="server">
            <TabsList>
              <TabsTrigger value="server">Server</TabsTrigger>
              <TabsTrigger value="client">Client</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-4" value="server">
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
                <code>{`// src/api/users.ts
import { z } from "zod";
import { route } from "~/framework/shared/api";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: userSchema,
  handler: ({ params }) => getUser(params.id),
});

export const create = route({
  method: "POST",
  body: z.object({ 
    name: z.string(), 
    email: z.string().email() 
  }),
  response: userSchema,
  handler: ({ body }) => createUser(body),
});`}</code>
              </pre>
            </TabsContent>
            <TabsContent className="mt-4" value="client">
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
                <code>{`// In client components
import { apiClient } from "~/api-client";

// Fully typed - no strings!
const user = await apiClient.users.byId({ 
  params: { id: "123" } 
});

const newUser = await apiClient.users.create({ 
  name: "John", 
  email: "john@example.com" 
});

// TypeScript knows the exact types!
// user: { id: string, name: string, email: string }
// newUser: { id: string, name: string, email: string }`}</code>
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>End-to-end type safety - catch errors at compile time</li>
            <li>Auto-completion in IDE - no guessing API shapes</li>
            <li>Runtime validation with Zod - invalid requests are rejected</li>
            <li>Single source of truth - define schema once, use everywhere</li>
            <li>Refactor-safe - changing schemas updates all usages</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
