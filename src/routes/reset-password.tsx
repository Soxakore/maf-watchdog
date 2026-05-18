import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Snowflake, ArrowLeft, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [hashValid, setHashValid] = useState(true);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash as access_token + type=recovery
    // The client automatically handles the hash; we just verify the session is present
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setHashValid(false);
      }
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated successfully.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!hashValid) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card/60 p-8 backdrop-blur text-center">
          <h1 className="text-xl font-semibold">Invalid or expired link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This reset link is no longer valid. Please request a new one.
          </p>
          <Link to="/forgot-password" className="mt-4 inline-block text-sm text-primary hover:underline">
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card/60 p-8 backdrop-blur">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-full bg-primary/15 p-3 text-primary">
            <Snowflake className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">New password</h1>
          <p className="text-xs text-muted-foreground">State 4285 · MAFIA alliance ops</p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-emerald-500/15 p-4 text-emerald-500">
              <CheckCircle2 className="size-8" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Your password has been updated.
            </p>
            <Button onClick={() => navigate({ to: "/login" })} className="w-full">
              Sign in
            </Button>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Saving..." : "Update password"}
              </Button>
            </form>
            <Link
              to="/login"
              className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
