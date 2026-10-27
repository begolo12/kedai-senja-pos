"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleStaffAction } from "@/lib/actions/staff";

export function StaffToggle({
  id,
  active,
  name,
  self,
}: {
  id: number;
  active: boolean;
  name: string;
  self: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={pending || self}
      aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${name}`}
      onCheckedChange={() =>
        startTransition(async () => {
          const result = await toggleStaffAction(id);
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