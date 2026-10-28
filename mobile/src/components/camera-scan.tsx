import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { haptic } from "../lib/haptic";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

export function cameraScanSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "BarcodeDetector" in window &&
    "getUserMedia" in (navigator.mediaDevices ?? {})
  );
}

/**
 * Pindai barcode lewat kamera belakang (BarcodeDetector API — tersedia di
 * Android WebView modern). Modal menampilkan pratinjau kamera dan menutup
 * otomatis begitu kode terbaca.
 */
export function CameraScan({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const Detector = (
          window as unknown as {
            BarcodeDetector: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        const detector = new Detector();

        const tick = async () => {
          if (cancelled) return;
          try {
            const found = await detector.detect(video);
            const code = found.find((entry) => entry.rawValue)?.rawValue;
            if (code) {
              haptic([40, 60, 40]);
              onDetect(code);
              return;
            }
          } catch {
            /* frame belum siap — coba lagi */
          }
          timer = window.setTimeout(() => void tick(), 350);
        };
        void tick();
      } catch (e) {
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Izin kamera ditolak. Aktifkan izin kamera untuk aplikasi ini."
            : "Kamera tidak bisa dibuka di perangkat ini.",
        );
      }
    }
    void start();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // onDetect stabil dari komponen pemanggil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scan-modal" onClick={(event) => event.stopPropagation()}>
        <span className="eyebrow">Pindai barcode</span>
        <h2>Arahkan kamera ke barcode</h2>
        <video
          ref={videoRef}
          playsInline
          muted
          className="scan-video"
          aria-label="Pratinjau kamera"
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="scan-frame-hint">
          <ScanLine className="spin-slow" />
        </div>
        <button className="ghost" onClick={onClose}>
          <X /> Tutup
        </button>
      </div>
    </div>
  );
}
