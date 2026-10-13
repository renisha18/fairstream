// Plain text wordmark.
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`font-semibold tracking-tight ${size === "lg" ? "text-[32px]" : "text-lg"}`}>FairStream</span>
  );
}
