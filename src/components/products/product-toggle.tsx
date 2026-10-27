"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleProductAction } from "@/lib/actions/catalog";

export function ProductToggle({ id, active, name }: { id: number; active: boolean; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${active ? "Hentikan" : "Jual"} ${name}`}
      onCheckedChange={() =>
        startTransition(async () => {
          const result = await toggleProductAction(id);
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