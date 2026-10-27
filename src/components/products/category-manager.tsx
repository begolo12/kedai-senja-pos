"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { deleteCategoryAction, saveCategoryAction } from "@/lib/actions/catalog";

type Category = { id: number; name: string; color: string; sortOrder: number };

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#a2542a");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEditing(null);
    setName("");
    setColor("#a2542a");
    setError(null);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCategoryAction({
        id: editing?.id,
        name,
        color,
        sortOrder: editing?.sortOrder ?? categories.length + 1,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Kategori diperbarui." : "Kategori ditambahkan.");
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Tags /> Kategori
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Kategori</DialogTitle>
          <DialogDescription>Dipakai untuk filter di kasir dan laporan.</DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="cat-name" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Nama
            </Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat-color" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Warna
            </Label>
            <Input
              id="cat-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-12 p-1"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : editing ? <Pencil /> : <Plus />}
            {editing ? "Simpan" : "Tambah"}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <ul className="max-h-64 divide-y divide-border overflow-y-auto border border-border">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="size-2.5 shrink-0" style={{ background: cat.color }} />
              <span className="flex-1 truncate text-sm">{cat.name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${cat.name}`}
                onClick={() => {
                  setEditing(cat);
                  setName(cat.name);
                  setColor(cat.color);
                }}
              >
                <Pencil className="size-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label={`Hapus ${cat.name}`} />}
                >
                  <Trash2 className="size-3" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus {cat.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Kategori hanya bisa dihapus bila tidak dipakai produk aktif.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        startTransition(async () => {
                          const result = await deleteCategoryAction(cat.id);
                          if (!result.ok) {
                            toast.error(result.error);
                            return;
                          }
                          toast.success("Kategori dihapus.");
                          router.refresh();
                        })
                      }
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}