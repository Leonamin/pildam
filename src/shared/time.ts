const rtf = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60],
];

/** "3시간 전", "어제", "방금" */
export function relativeTime(iso: string, now = Date.now()): string {
  const sec = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  }
  return "방금";
}
