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
import { saveCustomerAction } from "@/lib/actions/customers";

export type CustomerValues = {
  id?: number;
  name: string;
  phone: string | null;
  email: string | null;
};

export function CustomerDialog({ customer }: { customer?: CustomerValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(customer?.id);

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
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${customer?.name}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : <><Plus /> Pelanggan baru</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit pelanggan" : "Pelanggan baru"}
          </DialogTitle>
          <DialogDescription>
            Nomor telepon unik dan dipakai untuk mencari pelanggan di kasir.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await saveCustomerAction({
                id: customer?.id,
                name,
                phone,
                email,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(editing ? "Pelanggan diperbarui." : "Pelanggan ditambahkan.");
              setOpen(false);
              if (!editing) {
                setName("");
                setPhone("");
                setEmail("");
              }
              router.refresh();
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="c-name" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Nama
            </Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="c-phone" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Telepon
              </Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-email" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Email
              </Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Simpan perubahan" : "Tambah pelanggan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}