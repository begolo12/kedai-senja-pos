"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStaffAction } from "@/lib/actions/staff";
import type { StaffValues } from "./staff-dialog";

export function PinDialog({ staff }: { staff: StaffValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (pin.length < 4 || pin.length > 64) {
      setError("PIN / sandi harus 4–64 karakter.");
      return;
    }
    if (pin !== repeat) {
      setError("Ulangi PIN tidak sama.");
      return;
    }
    startTransition(async () => {
      const result = await saveStaffAction({
        id: staff.id,
        name: staff.name,
        username: staff.username,
        role: staff.role,
        active: staff.active,
        storeIds: staff.storeIds,
        pin,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`PIN ${staff.name} diganti.`);
      setOpen(false);
      setPin("");
      setRepeat("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setPin("");
          setRepeat("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Ganti PIN ${staff.name}`}
            title={`Ganti PIN ${staff.name}`}
          />
        }
      >
        <KeyRound className="size-3.5" /> PIN
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Ganti PIN / Sandi</DialogTitle>
          <DialogDescription>
            {staff.name} · ID <span className="font-mono">@{staff.username}</span>. Login
            memakai ID + PIN atau sandi.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`pin-${staff.id}`} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              PIN / Sandi baru
            </Label>
            <Input
              id={`pin-${staff.id}`}
              type="password"
              maxLength={64}
              autoComplete="new-password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\s/g, "").slice(0, 64))}
              className="font-mono"
              placeholder="Min. 4 karakter"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`pin2-${staff.id}`} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Ulangi PIN / Sandi
            </Label>
            <Input
              id={`pin2-${staff.id}`}
              type="password"
              maxLength={64}
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value.replace(/\s/g, "").slice(0, 64))}
              className="font-mono"
              placeholder="ulangi"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null} Simpan PIN
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
