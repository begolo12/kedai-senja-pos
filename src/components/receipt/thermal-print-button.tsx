"use client";

import { useState } from "react";
import { Bluetooth, Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildReceipt,
  drawerKick,
  pair,
  type EscposLine,
} from "@/lib/escpos";

// ESC/POS-over-BLE: common service/characteristic used by Epson, Xprinter, Rongta.
const SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const WRITE_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

type BluetoothCharacteristicLike = {
  writeValue(value: BufferSource): Promise<void>;
};

function isSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

async function connect(): Promise<BluetoothCharacteristicLike> {
  const device = await (
    navigator as Navigator & {
      bluetooth: {
        requestDevice(options: {
          filters?: { services?: string[] }[];
          optionalServices?: string[];
        }): Promise<{
          gatt?: {
            connect(): Promise<{
              getPrimaryService(uuid: string): Promise<{
                getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>;
              }>;
            }>;
          };
        }>;
      };
    }
  ).bluetooth.requestDevice({
    filters: [{ services: [SERVICE] }],
    optionalServices: [SERVICE],
  });
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Printer tidak terhubung.");
  const service = await server.getPrimaryService(SERVICE);
  return service.getCharacteristic(WRITE_CHAR);
}

async function sendChunks(characteristic: BluetoothCharacteristicLike, bytes: number[]) {
  const CHUNK = 180;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    await characteristic.writeValue(new Uint8Array(bytes.slice(index, index + CHUNK)));
    await new Promise((resolve) => setTimeout(resolve, 24));
  }
}

/** Pair a device once, print the receipt, then optionally kick the drawer. */
export async function printEscpos(lines: EscposLine[], kickDrawer: boolean) {
  if (!isSupported()) {
    throw new Error("Browser ini tidak mendukung Web Bluetooth. Pakai Google Chrome/Edge.");
  }
  const characteristic = await connect();
  if (lines.length > 0) await sendChunks(characteristic, buildReceipt(lines));
  if (kickDrawer) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await sendChunks(characteristic, drawerKick());
  }
}

/** Pair a device and kick the drawer only. */
export async function kickCashDrawer() {
  if (!isSupported()) {
    throw new Error("Browser ini tidak mendukung Web Bluetooth. Pakai Google Chrome/Edge.");
  }
  const characteristic = await connect();
  await sendChunks(characteristic, drawerKick());
}

export function ThermalPrintButton({ lines }: { lines: EscposLine[] }) {
  const [pending, setPending] = useState(false);
  const [busyDrawer, setBusyDrawer] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        title="Cetak langsung ke printer thermal lewat Bluetooth"
        onClick={() => {
          setPending(true);
          printEscpos(lines, true)
            .then(() => toast.success("Struk terkirim ke printer thermal; laci dibuka."))
            .catch((error: unknown) =>
              toast.error(
                error instanceof Error ? error.message : "Gagal mencetak ke printer.",
              ),
            )
            .finally(() => setPending(false));
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Bluetooth />} Thermal
      </Button>
      <Button
        variant="outline"
        disabled={busyDrawer}
        title="Buka laci tunai (printer harus tersambung)"
        onClick={() => {
          setBusyDrawer(true);
          kickCashDrawer()
            .then(() => toast.success("Laci dibuka."))
            .catch((error: unknown) =>
              toast.error(
                error instanceof Error ? error.message : "Gagal membuka laci.",
              ),
            )
            .finally(() => setBusyDrawer(false));
        }}
      >
        <Banknote /> Laci
      </Button>
    </>
  );
}

export { pair };
