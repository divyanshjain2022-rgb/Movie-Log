import { formatCurrency } from "@/lib/formula";

// Static class strings so Tailwind keeps them; one colour per seat class.
const SEAT_PALETTE = [
  { dot: "bg-emerald-500", seat: "bg-emerald-500/30 ring-emerald-500/50" },
  { dot: "bg-sky-500", seat: "bg-sky-500/30 ring-sky-500/50" },
  { dot: "bg-violet-500", seat: "bg-violet-500/30 ring-violet-500/50" },
  { dot: "bg-amber-500", seat: "bg-amber-500/30 ring-amber-500/50" },
  { dot: "bg-pink-500", seat: "bg-pink-500/30 ring-pink-500/50" },
  { dot: "bg-teal-500", seat: "bg-teal-500/30 ring-teal-500/50" },
];

function rowLabelFor(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export interface SeatMapCategory {
  code: string;
  description: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
}

export interface SeatMapRow {
  label: string | null;
  seats: Array<{
    id: string | null;
    status: "available" | "taken" | "gap";
    categoryCode: string | null;
  }>;
}

export function SeatMap({
  categories,
  rows,
  availableSeatCount,
  recommendedCode,
}: {
  categories: SeatMapCategory[];
  rows: SeatMapRow[];
  availableSeatCount: number;
  recommendedCode?: string | null;
}) {
  const pricedCategories = categories.filter((category) => category.price > 0);
  const colorIndex = new Map<string, number>();
  categories.forEach((category, index) => {
    colorIndex.set(category.code, index % SEAT_PALETTE.length);
  });

  const seatClass = (seat: { status: string; categoryCode: string | null }): string => {
    if (seat.status === "gap") return "bg-transparent";
    if (seat.status === "taken") return "bg-muted-foreground/15";
    const idx = seat.categoryCode ? colorIndex.get(seat.categoryCode) : undefined;
    const palette = idx === undefined ? SEAT_PALETTE[0] : SEAT_PALETTE[idx];
    return `${palette.seat} ring-1`;
  };

  return (
    <div className="space-y-4">
      {pricedCategories.length > 0 && (
        <div className="space-y-1.5">
          {pricedCategories.map((category) => (
            <div
              key={category.code}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                recommendedCode === category.code ? "bg-primary/10 text-primary" : "bg-secondary/30"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEAT_PALETTE[colorIndex.get(category.code) ?? 0].dot}`}
                />
                {category.description}
                {recommendedCode === category.code && (
                  <span className="text-[11px] font-normal">· best value</span>
                )}
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="font-semibold">{formatCurrency(category.price)}</span>
                <span className="text-xs text-muted-foreground">
                  {category.availableSeats}/{category.totalSeats} free
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <div>
          <div className="mx-auto mb-3 h-1 w-3/4 rounded-full bg-gradient-to-b from-foreground/30 to-transparent" />
          <p className="mb-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Screen
          </p>
          <div className="overflow-x-auto pb-1">
            <div className="mx-auto w-fit space-y-1">
              {rows.map((row, rowIndex) => (
                <div key={`${row.label ?? rowIndex}`} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground/50">
                    {row.label ?? rowLabelFor(rowIndex)}
                  </span>
                  <div className="flex gap-0.5">
                    {row.seats.map((seat, seatIndex) => (
                      <span
                        key={seatIndex}
                        title={seat.id ?? undefined}
                        className={`h-3.5 w-3.5 rounded-[3px] ${seatClass(seat)}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            {pricedCategories.map((category) => (
              <span key={category.code} className="flex items-center gap-1">
                <span
                  className={`h-3 w-3 rounded-[3px] ${SEAT_PALETTE[colorIndex.get(category.code) ?? 0].seat} ring-1`}
                />
                {category.description}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[3px] bg-muted-foreground/15" /> taken
            </span>
            <span className="ml-auto font-medium text-foreground">{availableSeatCount} free</span>
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          Seat map isn&apos;t available, but the price classes above are live.
        </p>
      )}
    </div>
  );
}
