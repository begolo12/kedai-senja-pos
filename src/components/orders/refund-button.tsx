"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
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
import { refundOrderAction } from "@/lib/actions/sales";

export function RefundButton({ orderId, number }: { orderId: number; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="text-destructive hover:text-destructive" />}
      >
        <RotateCcw /> Refund
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Refund {number}?</DialogTitle>
          <DialogDescription>
            Stok dikembalikan, poin pelanggan dikurangi, dan pesanan ditandai refund.
            Tindakan ini tidak bisa dibatalkan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="refund-reason" className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Alasan
          </Label>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="mis. pesanan salah input"
            rows={3}
          />
        </div>
        <Button
          variant="destructive"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const result = await refundOrderAction(orderId, reason.trim());
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success("Pesanan direfund.");
              setOpen(false);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Refund pesanan
        </Button>
      </DialogContent>
    </Dialog>
  );
}