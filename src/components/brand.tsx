import Image from "next/image";

export function TeraMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-256.jpg"
      alt="Logo Tera POS"
      width={256}
      height={256}
      className={className}
      priority
    />
  );
}

export function TeraWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-serif italic">Tera</span>{" "}
      <span className="font-mono text-[0.62em] tracking-[0.18em] uppercase">POS</span>
    </span>
  );
}
