import { type FormEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clientComponent } from "~/framework/shared/rsc";

export const APITester = clientComponent(() => {
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
        <Button type="submit" variant="secondary">
          Send
        </Button>
      </form>
      <Label className="sr-only" htmlFor="response">
        Response
      </Label>
      <Textarea
        className="min-h-[140px] resize-y font-mono"
        id="response"
        placeholder="Response will appear here..."
        readOnly
        ref={responseInputRef}
      />
    </div>
  );
});
