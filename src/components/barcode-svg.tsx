import { barcodeModules, code128Bars } from "@/lib/barcode";

/** Code128B sebagai SVG murni — aman dirender di server component. */
export function BarcodeSvg({
  value,
  height = 38,
  moduleWidth = 2,
  showText = true,
  className,
}: {
  value: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
  className?: string;
}) {
  const bars = code128Bars(value);
  if (!bars) return null;
  const quiet = 10; // quiet zone 10 modul
  const modules = barcodeModules(bars);
  const width = (modules + quiet * 2) * moduleWidth;
  const textHeight = showText ? 10 : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height + textHeight}`}
      width="100%"
      className={className}
      role="img"
      aria-label={`Barcode ${value}`}
      preserveAspectRatio="none"
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={(bar.x + quiet) * moduleWidth}
          y={0}
          width={bar.width * moduleWidth}
          height={height}
          fill="currentColor"
        />
      ))}
      {showText ? (
        <text
          x={width / 2}
          y={height + 8}
          textAnchor="middle"
          fontSize={textHeight}
          fontFamily="ui-monospace, monospace"
          fill="currentColor"
        >
          {value}
        </text>
      ) : null}
    </svg>
  );
}
