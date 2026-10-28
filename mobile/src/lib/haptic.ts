/**
 * Umpan balik haptic ringan untuk aksi penting di tablet/ponsel.
 * Aman dipanggil di lingkungan tanpa dukungan getaran.
 */
export function haptic(pattern: number | number[] = 30) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* perangkat tanpa getar — abaikan */
  }
}
