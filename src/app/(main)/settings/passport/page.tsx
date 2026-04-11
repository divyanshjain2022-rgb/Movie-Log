"use client";

import { useState } from "react";
import { Plus, Trash2, Shield, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared";
import { formatCurrency, formatDate } from "@/lib/formula";
import { usePassports, useCreatePassport, useUpdatePassport, useDeletePassport } from "@/hooks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PassportPage() {
  const { passports, isLoading, refetch } = usePassports();
  const { createPassport } = useCreatePassport();
  const { updatePassport } = useUpdatePassport();
  const { deletePassport } = useDeletePassport();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("PVR Passport");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiryDate, setExpiryDate] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [totalUses, setTotalUses] = useState("3");
  const [notes, setNotes] = useState("");

  const handleCreate = async () => {
    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      toast.error("Enter the passport cost");
      return;
    }

    try {
      await createPassport({
        name,
        purchase_date: purchaseDate,
        expiry_date: expiryDate || null,
        amount_paid: parseFloat(amountPaid),
        total_uses: parseInt(totalUses) || 3,
        notes: notes || null,
      });
      toast.success("Passport added!");
      setShowForm(false);
      setAmountPaid("");
      setNotes("");
      refetch();
    } catch {
      toast.error("Failed to add passport");
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await updatePassport(id, { is_active: !current });
      refetch();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePassport(id);
      toast.success("Passport deleted");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Passports" showBack />
        <div className="space-y-3 p-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        title="Passports"
        showBack
        action={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        }
      />

      <div className="space-y-4 p-4">
        {/* Add Form */}
        {showForm && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Purchase Date</Label>
                  <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount Paid</Label>
                  <Input type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="₹699" className="mt-1" />
                </div>
                <div>
                  <Label>Total Uses</Label>
                  <Input type="number" value={totalUses} onChange={(e) => setTotalUses(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="mt-1" />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Save Passport
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {passports.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-lg font-bold">
                  {formatCurrency(passports.reduce((sum, p) => sum + p.amount_paid, 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Net Savings</p>
                {(() => {
                  const net = passports.reduce((sum, p) => sum + p.net_savings, 0);
                  return (
                    <p className={cn("text-lg font-bold", net >= 0 ? "text-positive" : "text-negative")}>
                      {net >= 0 ? "+" : ""}{formatCurrency(net)}
                    </p>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Passport List */}
        {passports.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No passports added yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Track your PVR Passport purchases and savings
            </p>
          </div>
        )}

        {passports.map((passport) => {
          const usesRemaining = passport.total_uses - passport.uses_count;
          const isExpired = passport.expiry_date && new Date(passport.expiry_date) < new Date();

          return (
            <Card key={passport.id} className={cn(!passport.is_active && "opacity-50")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{passport.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Bought {formatDate(passport.purchase_date)} for {formatCurrency(passport.amount_paid)}
                    </p>
                    {passport.expiry_date && (
                      <p className={cn("text-xs", isExpired ? "text-negative" : "text-muted-foreground")}>
                        {isExpired ? "Expired" : "Expires"} {formatDate(passport.expiry_date)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={passport.is_active}
                      onCheckedChange={() => handleToggleActive(passport.id, passport.is_active)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(passport.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Usage bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      Uses: {passport.uses_count} / {passport.total_uses}
                    </span>
                    <span className={cn(
                      "font-medium",
                      usesRemaining > 0 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {usesRemaining > 0 ? `${usesRemaining} left` : "Fully used"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary/50">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min((passport.uses_count / passport.total_uses) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Savings */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-secondary/30 p-2">
                    <p className="text-muted-foreground">Saved</p>
                    <p className="font-semibold text-positive">{formatCurrency(passport.total_savings)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2">
                    <p className="text-muted-foreground">Cost</p>
                    <p className="font-semibold">{formatCurrency(passport.amount_paid)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2">
                    <p className="text-muted-foreground">Net</p>
                    <p className={cn("font-semibold", passport.net_savings >= 0 ? "text-positive" : "text-negative")}>
                      {passport.net_savings >= 0 ? "+" : ""}{formatCurrency(passport.net_savings)}
                    </p>
                  </div>
                </div>

                {passport.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{passport.notes}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
