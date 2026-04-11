"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useBudgets, useUpsertBudget, useMovies } from "@/hooks";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function BudgetPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const { budgets, isLoading, refetch } = useBudgets();
  const { movies } = useMovies();
  const { upsertBudget, isLoading: isSaving } = useUpsertBudget();

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear] = useState(currentYear);
  const [amount, setAmount] = useState("");

  const currentBudget = budgets.find(
    (b) => b.month === selectedMonth && b.year === selectedYear
  );

  // Calculate spending for selected month
  const monthMovies = movies.filter((m) => {
    const d = new Date(m.date);
    return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
  });
  const monthSpend = monthMovies.reduce((sum, m) => sum + m.total_cost, 0);

  const budgetAmount = currentBudget?.amount || 0;
  const budgetPercent = budgetAmount > 0 ? (monthSpend / budgetAmount) * 100 : 0;
  const budgetColor =
    budgetPercent > 100 ? "text-red-500" : budgetPercent > 75 ? "text-yellow-500" : "text-green-500";
  const barColor =
    budgetPercent > 100 ? "bg-red-500" : budgetPercent > 75 ? "bg-yellow-500" : "bg-green-500";

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await upsertBudget(selectedMonth, selectedYear, amt);
      toast.success("Budget saved");
      setAmount("");
      refetch();
    } catch {
      toast.error("Failed to save budget");
    }
  };

  return (
    <div className="min-h-screen">
      <PageHeader title="Monthly Budget" showBack />

      <div className="p-4 space-y-6">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            {/* Month selector */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {MONTHS.map((name, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedMonth(i + 1)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors",
                    selectedMonth === i + 1
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* Budget Progress */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {MONTHS[selectedMonth - 1]} {selectedYear}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {budgetAmount > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>
                        Spent: <span className="font-medium">{formatCurrency(monthSpend)}</span>
                      </span>
                      <span>
                        Budget: <span className="font-medium">{formatCurrency(budgetAmount)}</span>
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full transition-all rounded-full", barColor)}
                        style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                      />
                    </div>
                    <p className={cn("text-center text-sm font-medium", budgetColor)}>
                      {budgetPercent.toFixed(0)}% used
                      {budgetPercent > 100 && " (over budget!)"}
                    </p>
                    <p className="text-center text-xs text-muted-foreground">
                      {monthMovies.length} movies this month
                    </p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No budget set for this month
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Set Budget */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Set Budget</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="sr-only">Amount</Label>
                    <Input
                      type="number"
                      step="100"
                      placeholder={currentBudget ? `Current: ${formatCurrency(budgetAmount)}` : "Enter amount..."}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Budget History */}
            {budgets.filter((b) => b.year === selectedYear).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{selectedYear} Budgets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {budgets
                      .filter((b) => b.year === selectedYear)
                      .sort((a, b) => a.month - b.month)
                      .map((b) => {
                        const mMovies = movies.filter((m) => {
                          const d = new Date(m.date);
                          return d.getMonth() + 1 === b.month && d.getFullYear() === b.year;
                        });
                        const mSpend = mMovies.reduce((sum, m) => sum + m.total_cost, 0);
                        const pct = b.amount > 0 ? (mSpend / b.amount) * 100 : 0;
                        return (
                          <div key={b.id} className="flex items-center justify-between text-sm">
                            <span>{MONTHS[b.month - 1].slice(0, 3)}</span>
                            <div className="flex-1 mx-3 h-2 rounded-full bg-secondary overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  pct > 100 ? "bg-red-500" : pct > 75 ? "bg-yellow-500" : "bg-green-500"
                                )}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-muted-foreground">
                              {formatCurrency(mSpend)} / {formatCurrency(b.amount)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
