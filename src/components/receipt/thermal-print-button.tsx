"use client";

import { useState } from "react";
import { Bluetooth, Banknote, Cable, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildReceipt,
  drawerKick,
  type EscposLine,
} from "@/lib/escpos";

// ESC/POS-over-BLE: common service/characteristic used by Epson, Xprinter, Rongta.
const SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const WRITE_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

type BluetoothCharacteristicLike = {
  writeValue(value: BufferSource): Promise<void>;
};

function bleSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

async function connectBle(): Promise<(bytes: number[]) => Promise<void>> {
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
  const characteristic = await service.getCharacteristic(WRITE_CHAR);
  return (bytes: number[]) => sendChunks((data) => characteristic.writeValue(data), bytes);
}

/** Printer USB kabel: class 7 (printer), endpoint bulk-out. */
async function connectUsb(): Promise<(bytes: number[]) => Promise<void>> {
  const device = await (
    navigator as Navigator & {
      usb: {
        requestDevice(options: {
          filters: { classCode?: number }[];
        }): Promise<USBDeviceLike>;
      };
    }
  ).usb.requestDevice({ filters: [{ classCode: 7 }] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const iface = device.configurations
    .flatMap((config) => config.interfaces)
    .find((entry) => entry.interfaceClass === 7);
  if (!iface) throw new Error("Antarmuka printer tidak ditemukan.");
  await device.claimInterface(iface.interfaceNumber);
  const endpoint = iface.alternates[0]?.endpoints.find((e) => e.direction === "out");
  if (!endpoint) throw new Error("Endpoint printer tidak ditemukan.");
  const target = endpoint.endpointNumber;
  return (bytes: number[]) =>
    sendChunks(async (chunk) => {
      const result = await device.transferOut(target, chunk);
      if (result.status !== "ok") throw new Error("Transfer ke printer gagal.");
    }, bytes);
}

type USBDeviceLike = {
  configuration: unknown;
  configurations: {
    interfaces: {
      interfaceNumber: number;
      interfaceClass: number;
      alternates: { endpoints: { endpointNumber: number; direction: string }[] }[];
    }[];
  }[];
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: string }>;
};

async function sendChunks(
  write: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
  bytes: number[],
) {
  const CHUNK = 180;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    const chunk = new Uint8Array(new ArrayBuffer(Math.min(CHUNK, bytes.length - index)));
    chunk.set(bytes.slice(index, index + CHUNK));
    await write(chunk);
    await new Promise((resolve) => setTimeout(resolve, 24));
  }
}

export type EscposTransport = "ble" | "usb";

/** Pair a device once, print the receipt, then optionally kick the drawer. */
export async function printEscpos(
  lines: EscposLine[],
  kickDrawer: boolean,
  transport: EscposTransport = "ble",
) {
  const connect = transport === "usb" ? connectUsb : connectBle;
  const send = await connect();
  if (lines.length > 0) await send(buildReceipt(lines));
  if (kickDrawer) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await send(drawerKick());
  }
}

/** Pair a BLE device and kick the drawer only. */
export async function kickCashDrawer() {
  if (!bleSupported()) {
    throw new Error("Browser ini tidak mendukung Web Bluetooth. Pakai Google Chrome/Edge.");
  }
  const send = await connectBle();
  await send(drawerKick());
}

export function ThermalPrintButton({ lines }: { lines: EscposLine[] }) {
  const [pending, setPending] = useState<"ble" | "usb" | null>(null);
  const [busyDrawer, setBusyDrawer] = useState(false);

  function run(transport: "ble" | "usb") {
    setPending(transport);
    printEscpos(lines, true, transport)
      .then(() =>
        toast.success(
          transport === "ble"
            ? "Struk terkirim ke printer Bluetooth; laci dibuka."
            : "Struk terkirim ke printer USB; laci dibuka.",
        ),
      )
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Gagal mencetak ke printer.",
        ),
      )
      .finally(() => setPending(null));
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={pending !== null}
        title="Cetak langsung ke printer thermal lewat Bluetooth"
        onClick={() => run("ble")}
      >
        {pending === "ble" ? <Loader2 className="animate-spin" /> : <Bluetooth />} Thermal
      </Button>
      <Button
        variant="outline"
        disabled={pending !== null}
        title="Cetak langsung ke printer thermal lewat kabel USB"
        onClick={() => run("usb")}
      >
        {pending === "usb" ? <Loader2 className="animate-spin" /> : <Cable />} USB
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
