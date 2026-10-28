"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { saveTableAction } from "@/lib/actions/tables";

export type TableFormValues = {
  id?: number;
  name: string;
  seats: number;
  active: boolean;
};

export function TableDialog({ table }: { table?: TableFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<TableFormValues>(
    table ?? { name: "", seats: 2, active: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(table?.id);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTableAction({
        id: table?.id,
        name: values.name,
        seats: values.seats,
        active: values.active,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Meja diperbarui." : "Meja ditambahkan.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          editing ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${table?.name}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : (<><Plus /> Meja</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit meja" : "Meja baru"}
          </DialogTitle>
          <DialogDescription>Nama meja unik per toko; muncul di struk.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tb-name" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Nama
            </Label>
            <Input
              id="tb-name"
              value={values.name}
              onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
              required
              maxLength={20}
              placeholder="mis. Meja 4"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tb-seats" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Jumlah kursi
            </Label>
            <Input
              id="tb-seats"
              value={values.seats}
              onChange={(e) => {
                const next = Math.min(
                  50,
                  Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)),
                );
                setValues((prev) => ({ ...prev, seats: next }));
              }}
              inputMode="numeric"
              className="font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.active}
              onCheckedChange={(checked) =>
                setValues((prev) => ({ ...prev, active: checked === true }))
              }
            />
            Aktif
          </label>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}{" "}
            {editing ? "Simpan" : "Tambah meja"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
