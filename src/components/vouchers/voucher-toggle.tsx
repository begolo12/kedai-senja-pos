"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleVoucherAction } from "@/lib/actions/vouchers";

export function VoucherToggle({ id, active, code }: { id: number; active: boolean; code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${active ? "Matikan" : "Aktifkan"} voucher ${code}`}
      onCheckedChange={() =>
        startTransition(async () => {
          const result = await toggleVoucherAction(id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    />
  );
}
