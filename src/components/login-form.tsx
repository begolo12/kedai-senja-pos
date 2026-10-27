"use client";

import { useActionState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
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
          placeholder="mis. manajemen"
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
          PIN
        </Label>
        <div className="relative">
          <Input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            autoComplete="off"
            placeholder="••••"
            className="h-11 pl-10 font-mono text-lg tracking-[0.4em]"
            required
          />
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-11 w-full bg-signal text-signal-foreground hover:bg-signal/90"
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        Masuk ke kasir
      </Button>
    </form>
  );
}