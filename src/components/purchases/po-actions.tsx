"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  cancelPurchaseOrderAction,
  receivePurchaseOrderAction,
} from "@/lib/actions/purchases";

export function PoActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (status !== "ordered") return null;

  function run(action: (id: number) => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action(id);
      if (!result.ok) {
        toast.error(result.error ?? "Gagal.");
        return;
      }
      toast.success(done);
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(receivePurchaseOrderAction, `PO #${id} diterima; stok sudah masuk.`)}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Terima
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(cancelPurchaseOrderAction, `PO #${id} dibatalkan.`)}
        >
          <X /> Batal
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setConfirming(true)}
      title="Terima (stok masuk) atau batalkan PO"
    >
      Proses
    </Button>
  );
}
