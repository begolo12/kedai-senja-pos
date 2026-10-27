"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importMenuAction } from "@/lib/actions/catalog";

const EXAMPLE = `nama,kategori,harga,modal,stok,satuan,pilihan
Ricebowl Ayam Geprek,Ricebowl,18000,9000,30,porsi,Level 1;Level 2;Level 3
Sushi Salmon Mentai 6 pcs,Sushi,25000,14000,15,porsi,
Es Teh Manis,Minuman Bubuk,5000,1500,100,gelas,Normal;Less sugar;No sugar
Extra Nasi,Ricebowl,3000,1000,50,porsi,`;

export function ImportMenuDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload /> Impor menu
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Impor menu dari spreadsheet</DialogTitle>
          <DialogDescription>
            Tempel baris dari Excel/Google Sheets. Produk dengan nama sama akan
            diperbarui, bukan diduplikasi. Kategori baru dibuat otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="menu-csv" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            CSV
          </Label>
          <Textarea
            id="menu-csv"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={10}
            placeholder={EXAMPLE}
            className="font-mono text-xs"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Kolom: nama, kategori, harga, modal, stok, satuan, pilihan.
            Harga dalam rupiah. Pilihan dipisah tanda titik koma.
          </p>
        </div>

        {error ? (
          <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCsv(EXAMPLE)} type="button">
            Isi contoh warkop
          </Button>
          <Button
            className="flex-1"
            disabled={pending || csv.trim().length < 5}
            onClick={() =>
              startTransition(async () => {
                const result = await importMenuAction(csv);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                toast.success(
                  `Menu diimpor: ${result.created ?? 0} baru, ${result.updated ?? 0} diperbarui.`,
                );
                setOpen(false);
                setCsv("");
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Impor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}