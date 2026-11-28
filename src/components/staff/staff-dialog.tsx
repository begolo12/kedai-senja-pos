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
import {
  addSubscriptionDuration,
  formatExpiryDate,
  type DurationUnit,
} from "@/lib/subscription";

export type StaffValues = {
  id?: number;
  name: string;
  username: string;
  role: "admin" | "owner" | "cashier" | "kitchen";
  active: boolean;
  storeIds: number[];
  subscriptionNote?: string;
};

const DURATION_PRESETS: { label: string; amount: number; unit: DurationUnit }[] = [
  { label: "1 Bln", amount: 1, unit: "months" },
  { label: "3 Bln", amount: 3, unit: "months" },
  { label: "6 Bln", amount: 6, unit: "months" },
  { label: "1 Thn", amount: 1, unit: "years" },
];

export function StaffDialog({
  staff,
  stores,
}: {
  staff?: StaffValues;
  stores: { id: number; name: string }[];
}) {
  const router = useRouter();
  const editing = Boolean(staff?.id);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(staff?.name ?? "");
  const [username, setUsername] = useState(staff?.username ?? "");
  const [role, setRole] = useState<"admin" | "owner" | "cashier" | "kitchen">(
    staff?.role ?? "owner",
  );
  const [active, setActive] = useState(staff?.active ?? true);
  const [storeIds, setStoreIds] = useState<number[]>(staff?.storeIds ?? []);
  const [createStore, setCreateStore] = useState(!staff?.id);
  const [storeName, setStoreName] = useState("");
  const [subscriptionNote, setSubscriptionNote] = useState(staff?.subscriptionNote ?? "");
  const [durationMode, setDurationMode] = useState<"keep" | "unlimited" | "custom">(
    editing ? "keep" : "custom",
  );
  const [durationAmount, setDurationAmount] = useState(1);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("months");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewExpiry =
    role === "admin" || durationMode === "unlimited"
      ? null
      : durationMode === "custom"
        ? addSubscriptionDuration(new Date(), durationAmount, durationUnit)
        : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setPin("");
        } else if (staff) {
          setName(staff.name);
          setUsername(staff.username);
          setRole(staff.role);
          setActive(staff.active);
          setStoreIds(staff.storeIds);
          setSubscriptionNote(staff.subscriptionNote ?? "");
          setDurationMode("keep");
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
        {editing ? <Pencil className="size-3.5" /> : <><Plus /> Buat ID Baru</>}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{editing ? "Edit Akun" : "Buat ID Baru"}</DialogTitle>
          <DialogDescription>
            Login memakai ID + PIN / sandi (4–64 karakter).{" "}
            {editing
              ? "Kosongkan sandi bila tidak ingin mengganti."
              : "Pemilik otomatis mendapat seluruh fitur POS untuk tokonya."}
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
                createStore: !editing && role !== "admin" ? createStore : false,
                storeName: !editing && role !== "admin" && createStore ? storeName : "",
                subscriptionNote,
                durationMode: role === "admin" ? "unlimited" : durationMode,
                durationAmount: durationMode === "custom" ? durationAmount : undefined,
                durationUnit: durationMode === "custom" ? durationUnit : "months",
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(editing ? "Akun diperbarui." : "ID baru berhasil dibuat.");
              setOpen(false);
              if (!editing) {
                setName("");
                setUsername("");
                setPin("");
                setRole("owner");
                setActive(true);
                setStoreIds([]);
                setCreateStore(true);
                setStoreName("");
                setSubscriptionNote("");
                setDurationMode("custom");
                setDurationAmount(1);
                setDurationUnit("months");
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
                onChange={(e) => {
                  const next = e.target.value as "admin" | "owner" | "cashier" | "kitchen";
                  setRole(next);
                  if (!editing) setCreateStore(next === "owner");
                }}
                className="h-8 w-full border border-input bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="owner">Pemilik (Semua fitur POS)</option>
                <option value="cashier">Kasir</option>
                <option value="kitchen">Barista / Dapur</option>
                <option value="admin">Admin Utama (Back Office)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-pin" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                PIN / Sandi {editing ? "baru" : ""}
              </Label>
              <Input
                id="s-pin"
                type="password"
                maxLength={64}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\s/g, "").slice(0, 64))}
                placeholder={editing ? "••••••" : "Min. 4 karakter"}
                className="font-mono"
                required={!editing}
              />
            </div>
          </div>

          {role !== "admin" ? (
            <div className="space-y-2 border border-border bg-muted/15 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  Masa Berlaku Langganan
                </span>
                {durationMode !== "keep" ? (
                  <span className="font-mono text-[11px] text-signal">
                    {durationMode === "unlimited"
                      ? "Tanpa batas"
                      : `s.d. ${formatExpiryDate(previewExpiry)}`}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Pertahankan saat ini</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setDurationMode("keep")}
                    className={`border px-2 py-1 text-xs ${
                      durationMode === "keep"
                        ? "border-signal bg-signal/15 text-signal"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    Tetap
                  </button>
                ) : null}
                {DURATION_PRESETS.map((preset) => {
                  const selected =
                    durationMode === "custom" &&
                    durationAmount === preset.amount &&
                    durationUnit === preset.unit;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDurationMode("custom");
                        setDurationAmount(preset.amount);
                        setDurationUnit(preset.unit);
                      }}
                      className={`border px-2 py-1 text-xs ${
                        selected
                          ? "border-signal bg-signal/15 text-signal"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setDurationMode("unlimited")}
                  className={`border px-2 py-1 text-xs ${
                    durationMode === "unlimited"
                      ? "border-signal bg-signal/15 text-signal"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  Tanpa Batas
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  aria-label="Jumlah durasi"
                  type="number"
                  min={1}
                  max={120}
                  value={durationAmount}
                  onChange={(e) => {
                    setDurationMode("custom");
                    setDurationAmount(Math.max(1, Math.min(120, Number(e.target.value) || 1)));
                  }}
                  className="h-8 font-mono text-xs"
                />
                <select
                  aria-label="Satuan durasi"
                  value={durationUnit}
                  onChange={(e) => {
                    setDurationMode("custom");
                    setDurationUnit(e.target.value as DurationUnit);
                  }}
                  className="h-8 w-full border border-input bg-card px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="months">Bulan</option>
                  <option value="years">Tahun</option>
                </select>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="s-note" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Catatan / Kontak (opsional)
            </Label>
            <Input
              id="s-note"
              value={subscriptionNote}
              onChange={(e) => setSubscriptionNote(e.target.value)}
              placeholder="mis. WA 0812xxx · Paket 1 Tahun"
            />
          </div>

          {role !== "admin" ? (
            <div className="space-y-2">
              {!editing ? (
                <div className="space-y-2 border border-border bg-muted/20 p-2.5">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={createStore}
                      onChange={(event) => setCreateStore(event.target.checked)}
                      className="size-3.5 accent-foreground"
                    />
                    Buatkan toko baru otomatis untuk akun ini
                  </label>
                  {createStore ? (
                    <Input
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Nama toko baru (opsional, default nama akun)"
                      className="h-8 text-xs"
                    />
                  ) : null}
                </div>
              ) : null}
              <span className="block text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Toko yang boleh dibuka
              </span>
              <div className="grid max-h-28 grid-cols-2 gap-1.5 overflow-y-auto">
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
                    <span className="truncate">{store.name}</span>
                  </label>
                ))}
              </div>
              {stores.length === 0 && !createStore ? (
                <p className="text-[11px] text-destructive">Buat toko dulu di Daftar Toko atau centang buat toko baru.</p>
              ) : null}
            </div>
          ) : (
            <p className="border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
              Admin Utama masuk ke Back Office dan berlaku permanen tanpa batas waktu.
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
          <Button type="submit" disabled={pending} className="w-full bg-signal text-signal-foreground hover:bg-signal/90">
            {pending ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Simpan perubahan" : "Tambah ID"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
