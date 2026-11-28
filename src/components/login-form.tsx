"use client";

import { useActionState } from "react";
import { Loader2, LockKeyhole, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [demoState, demoAction, demoPending] = useActionState(loginAction, initial);
  const error = state.error || demoState.error;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-5">
        <div className="space-y-1.5">
          <Label
            htmlFor="username"
            className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase"
          >
            ID Login
          </Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.username ?? ""}
            placeholder="mis. demo"
            className="h-11 font-mono text-sm"
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="pin"
            className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase"
          >
            PIN / Sandi
          </Label>
          <div className="relative">
            <Input
              id="pin"
              name="pin"
              type="password"
              maxLength={64}
              autoComplete="off"
              placeholder="••••••"
              className="h-11 pl-10 font-mono text-base tracking-[0.2em]"
              required
            />
            <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={pending || demoPending}
          className="h-11 w-full bg-signal text-signal-foreground hover:bg-signal/90"
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Masuk ke kasir
        </Button>
      </form>

      <div className="border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Akun Demo Bersama
            </p>
            <p className="mt-1 font-mono text-xs text-foreground">
              ID <span className="text-signal">demo</span> · Sandi{" "}
              <span className="text-signal">demo123</span>
            </p>
          </div>
          <span className="stamp border-signal/40 text-signal">Akses penuh</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Data tersimpan bersama dan berlanjut untuk pengguna berikutnya.
        </p>
        <form action={demoAction} className="mt-3">
          <input type="hidden" name="username" value="demo" />
          <input type="hidden" name="pin" value="demo123" />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending || demoPending}
            className="w-full"
          >
            {demoPending ? <Loader2 className="animate-spin" /> : <Play className="size-3.5" />}
            Coba Akun Demo
          </Button>
        </form>
      </div>
    </div>
  );
}