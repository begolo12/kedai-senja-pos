"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Combine, Loader2 } from "lucide-react";
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
import { mergeOrdersAction, moveOrderTableAction } from "@/lib/actions/tables";
import { formatMoney } from "@/lib/money";

export function MoveTableDialog({
  orderId,
  number,
  tables,
  currency,
}: {
  orderId: number;
  number: string;
  tables: { id: number; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tableId, setTableId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function move() {
    if (!tableId) return;
    startTransition(async () => {
      const result = await moveOrderTableAction(orderId, Number(tableId));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${number} dipindah meja.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <ArrowRightLeft /> Pindah
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Pindah meja</DialogTitle>
          <DialogDescription>
            Pindahkan {number} ke meja lain. Hanya berlaku untuk tagihan terbuka.
          </DialogDescription>
        </DialogHeader>
        <select
          value={tableId}
          onChange={(event) => setTableId(event.target.value)}
          aria-label="Meja tujuan"
          className="h-9 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="">Pilih meja tujuan…</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name}
            </option>
          ))}
        </select>
        <Button onClick={move} disabled={pending || !tableId}>
          {pending ? <Loader2 className="animate-spin" /> : null} Pindahkan
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function MergeOrdersDialog({
  sourceId,
  number,
  total,
  others,
  currency,
}: {
  sourceId: number;
  number: string;
  total: number;
  others: { id: number; number: string; tableLabel: string | null; total: number }[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function merge() {
    if (!targetId) return;
    startTransition(async () => {
      const result = await mergeOrdersAction(sourceId, Number(targetId));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${number} digabung.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />} disabled={others.length === 0}>
        <Combine /> Gabung
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Gabung tagihan</DialogTitle>
          <DialogDescription>
            Item {number} ({formatMoney(total, currency)}) dipindah ke tagihan lain;
            tagihan ini ditandai tergabung.
          </DialogDescription>
        </DialogHeader>
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          aria-label="Tagihan tujuan"
          className="h-9 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="">Pilih tagihan tujuan…</option>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.number}
              {other.tableLabel ? ` · ${other.tableLabel}` : ""} ·{" "}
              {formatMoney(other.total, currency)}
            </option>
          ))}
        </select>
        <Button onClick={merge} disabled={pending || !targetId}>
          {pending ? <Loader2 className="animate-spin" /> : null} Gabungkan
        </Button>
      </DialogContent>
    </Dialog>
  );
}
