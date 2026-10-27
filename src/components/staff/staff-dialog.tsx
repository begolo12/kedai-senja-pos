"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
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

export type StaffValues = {
  id?: number;
  name: string;
  username: string;
  role: "admin" | "cashier";
  active: boolean;
  storeIds: number[];
};

export function StaffDialog({
  staff,
  stores,
}: {
  staff?: StaffValues;
  stores: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(staff?.name ?? "");
  const [username, setUsername] = useState(staff?.username ?? "");
  const [role, setRole] = useState<"admin" | "cashier">(staff?.role ?? "cashier");
  const [active, setActive] = useState(staff?.active ?? true);
  const [storeIds, setStoreIds] = useState<number[]>(staff?.storeIds ?? []);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(staff?.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setPin("");
        }
      }}
    >
      <DialogTrigger
        render={
          editing ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${staff?.name}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : <><Plus /> Staf baru</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{editing ? "Edit staf" : "Staf baru"}</DialogTitle>
          <DialogDescription>
            Login memakai ID + PIN, tanpa password. {editing ? "Kosongkan PIN bila tidak ingin mengganti." : "PIN 4–8 digit."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await saveStaffAction({
                id: staff?.id,
                name,
                username: username.toLowerCase(),
                role,
                pin: pin || undefined,
                active,
                storeIds,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(editing ? "Staf diperbarui." : "Staf ditambahkan.");
              setOpen(false);
              if (!editing) {
                setName("");
                setUsername("");
                setPin("");
                setRole("cashier");
                setActive(true);
                setStoreIds([]);
              }
              router.refresh();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="s-name" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Nama
              </Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-username" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                ID Login
              </Label>
              <Input
                id="s-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-role" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Akses
              </Label>
              <select
                id="s-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "cashier")}
                className="h-8 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="cashier">Kasir</option>
                <option value="admin">Manajemen</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-pin" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                PIN {editing ? "baru" : ""}
              </Label>
              <Input
                id="s-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder={editing ? "••••" : "4–8 digit"}
                className="font-mono"
                required={!editing}
              />
            </div>
          </div>
          {role === "cashier" ? (
            <div className="space-y-1">
              <span className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Toko yang boleh dibuka
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {stores.map((store) => (
                  <label key={store.id} className="flex items-center gap-2 border border-border px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={storeIds.includes(store.id)}
                      onChange={(event) =>
                        setStoreIds((prev) =>
                          event.target.checked
                            ? [...prev, store.id]
                            : prev.filter((id) => id !== store.id),
                        )
                      }
                      className="size-3.5 accent-foreground"
                    />
                    {store.name}
                  </label>
                ))}
              </div>
              {stores.length === 0 ? (
                <p className="text-[11px] text-destructive">Buat toko dulu di menu Toko.</p>
              ) : null}
            </div>
          ) : (
            <p className="border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
              Manajemen otomatis bisa membuka semua toko.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-3.5 accent-foreground"
            />
            Akun aktif
          </label>
          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Simpan perubahan" : "Tambah staf"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}