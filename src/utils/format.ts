// Formatted on the server and passed down as strings, so client components never
// re-format dates in a different timezone and cause hydration mismatches.
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatDateTime(date: Date | null | undefined): string {
  return date ? `${dateTimeFormat.format(date)} UTC` : "—";
}

export function formatUsd(amount: number): string {
  return amount < 0.01 && amount > 0 ? `$${amount.toFixed(5)}` : `$${amount.toFixed(2)}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
