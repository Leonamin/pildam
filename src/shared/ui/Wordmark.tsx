import { Feather } from "lucide-react";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 font-manuscript font-semibold text-ink ${lg ? "text-4xl" : "text-xl"}`}>
      <Feather aria-hidden="true" className="text-accent" size={lg ? 30 : 20} />
      필담
    </span>
  );
}
