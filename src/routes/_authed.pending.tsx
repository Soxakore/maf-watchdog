import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Snowflake } from "lucide-react";

export const Route = createFileRoute("/_authed/pending")({ component: PendingPage });

function PendingPage() {
  return (
    <div className="mx-auto max-w-md pt-12">
      <Card className="p-6 text-center">
        <Snowflake className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 text-xl font-semibold">Waiting for approval</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn't authorized to view MAF Tracker yet. Ask an admin to grant you access.
        </p>
      </Card>
    </div>
  );
}
