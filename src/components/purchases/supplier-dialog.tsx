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
import { Textarea } from "@/components/ui/textarea";
import { saveSupplierAction } from "@/lib/actions/purchases";

export type SupplierFormValues = {
  id?: number;
  name: string;
  phone: string;
  note: string;
  active: boolean;
};

export function SupplierDialog({ supplier }: { supplier?: SupplierFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<SupplierFormValues>(
    supplier ?? { name: "", phone: "", note: "", active: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(supplier?.id);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveSupplierAction({
        id: supplier?.id,
        name: values.name,
        phone: values.phone,
        note: values.note,
        active: values.active,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Supplier diperbarui." : "Supplier ditambahkan.");
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
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${supplier?.name}`} />
          ) : (
            <Button variant="outline" size="sm" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : (<><Plus /> Supplier</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit supplier" : "Supplier baru"}
          </DialogTitle>
          <DialogDescription>
            Supplier dipakai di purchase order; nama unik per toko.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-name" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Nama
            </Label>
            <Input
              id="s-name"
              value={values.name}
              onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-phone" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Telepon (opsional)
            </Label>
            <Input
              id="s-phone"
              value={values.phone}
              onChange={(e) => setValues((prev) => ({ ...prev, phone: e.target.value }))}
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-note" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Catatan
            </Label>
            <Textarea
              id="s-note"
              value={values.note}
              onChange={(e) => setValues((prev) => ({ ...prev, note: e.target.value }))}
              rows={2}
              maxLength={200}
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
            {editing ? "Simpan" : "Tambah supplier"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
