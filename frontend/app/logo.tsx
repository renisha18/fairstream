// FairStream wordmark, set in Sancreek.
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return <span className={`wordmark ${size === "lg" ? "text-[64px]" : "text-[28px]"}`}>FairStream</span>;
}
