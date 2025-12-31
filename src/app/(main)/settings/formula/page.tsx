"use client";

import { useState, useEffect } from "react";
import { Save, RotateCcw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { FormulaConfig } from "@/types";
import type { FormulaParams } from "@/types";

interface FormulaState {
    id: string;
    params: FormulaParams;
}

const DEFAULT_PARAMS: FormulaParams = {
    rating_exponents: {
        tier1: { max_rating: 2, exponent: 0.3 },
        tier2: { max_rating: 4, exponent: 0.5 },
        tier3: { max_rating: 6, exponent: 0.7 },
        tier4: { max_rating: 8, exponent: 1.0 },
        tier5: { max_rating: 10, exponent: 1.3 },
    },
    cost_floor: 50,
    use_true_cost: true,
};

export default function FormulaPage() {
    const [config, setConfig] = useState<FormulaState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        async function fetchConfig() {
            const { data } = await supabase
                .from("formula_configs")
                .select("*")
                .eq("is_active", true)
                .single();

            if (data) {
                const formulaConfig = data as FormulaConfig;
                setConfig({
                    id: formulaConfig.id,
                    params: (formulaConfig.params as unknown as FormulaParams) || DEFAULT_PARAMS,
                });
            }
            setIsLoading(false);
        }
        fetchConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        if (!config) return;
        setIsSaving(true);

        try {
            const { error } = await supabase
                .from("formula_configs")
                .update({ params: config.params as unknown } as never)
                .eq("id", config.id);

            if (error) throw error;
            toast.success("Formula saved!");
        } catch {
            toast.error("Failed to save formula");
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (!config) return;
        setConfig({ ...config, params: DEFAULT_PARAMS });
        toast.success("Reset to defaults");
    };

    const updateParams = (updates: Partial<FormulaParams>) => {
        if (!config) return;
        setConfig({ ...config, params: { ...config.params, ...updates } });
    };

    const updateTier = (tier: keyof typeof DEFAULT_PARAMS.rating_exponents, field: "max_rating" | "exponent", value: number) => {
        if (!config) return;
        setConfig({
            ...config,
            params: {
                ...config.params,
                rating_exponents: {
                    ...config.params.rating_exponents,
                    [tier]: {
                        ...config.params.rating_exponents[tier],
                        [field]: value,
                    },
                },
            },
        });
    };

    const calculateSample = (rating: number, cost: number) => {
        if (!config) return 0;
        const tiers = config.params.rating_exponents;
        let exponent = 1;

        if (rating <= tiers.tier1.max_rating) exponent = tiers.tier1.exponent;
        else if (rating <= tiers.tier2.max_rating) exponent = tiers.tier2.exponent;
        else if (rating <= tiers.tier3.max_rating) exponent = tiers.tier3.exponent;
        else if (rating <= tiers.tier4.max_rating) exponent = tiers.tier4.exponent;
        else exponent = tiers.tier5.exponent;

        const effectiveCost = Math.max(cost, config.params.cost_floor);
        return Math.pow(rating, exponent) / (effectiveCost / 100);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen">
                <PageHeader title="Value Formula" showBack />
                <div className="space-y-4 p-4">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-60" />
                </div>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="min-h-screen">
                <PageHeader title="Value Formula" showBack />
                <div className="flex min-h-[60vh] items-center justify-center p-4">
                    <p className="text-muted-foreground">No formula config found</p>
                </div>
            </div>
        );
    }

    const tiers = [
        { key: "tier1" as const, label: "Tier 1 (Bad)", color: "text-negative" },
        { key: "tier2" as const, label: "Tier 2 (Poor)", color: "text-orange-500" },
        { key: "tier3" as const, label: "Tier 3 (Mid)", color: "text-yellow-500" },
        { key: "tier4" as const, label: "Tier 4 (Good)", color: "text-lime-500" },
        { key: "tier5" as const, label: "Tier 5 (Great)", color: "text-positive" },
    ];

    return (
        <div className="min-h-screen">
            <PageHeader
                title="Value Formula"
                showBack
                action={
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={handleReset}>
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving}>
                            <Save className="mr-2 h-4 w-4" />
                            {isSaving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                }
            />

            <div className="space-y-4 p-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex gap-3">
                            <Info className="h-5 w-5 flex-shrink-0 text-primary" />
                            <div className="text-sm text-muted-foreground">
                                <p>Value Score = Rating^Exponent ÷ (Cost ÷ 100)</p>
                                <p className="mt-1">Higher exponent = rating matters more.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Cost Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label>Cost Floor (₹)</Label>
                            <div className="mt-2 flex items-center gap-4">
                                <Slider
                                    value={[config.params.cost_floor]}
                                    onValueChange={([v]) => updateParams({ cost_floor: v })}
                                    min={0}
                                    max={200}
                                    step={10}
                                    className="flex-1"
                                />
                                <Input
                                    type="number"
                                    value={config.params.cost_floor}
                                    onChange={(e) => updateParams({ cost_floor: parseInt(e.target.value) || 0 })}
                                    className="w-20"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Use True Cost</Label>
                                <p className="text-xs text-muted-foreground">Include F&B</p>
                            </div>
                            <Switch
                                checked={config.params.use_true_cost}
                                onCheckedChange={(v) => updateParams({ use_true_cost: v })}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Rating Tiers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {tiers.map(({ key, label, color }) => (
                            <div key={key} className="space-y-2">
                                <Label className={color}>{label}</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Max Rating</Label>
                                        <Input
                                            type="number"
                                            value={config.params.rating_exponents[key].max_rating}
                                            onChange={(e) => updateTier(key, "max_rating", parseFloat(e.target.value) || 0)}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Exponent</Label>
                                        <Input
                                            type="number"
                                            value={config.params.rating_exponents[key].exponent}
                                            onChange={(e) => updateTier(key, "exponent", parseFloat(e.target.value) || 0)}
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="rounded bg-secondary p-2">
                                <p className="text-muted-foreground">Rating 3</p>
                                <p className="text-lg font-bold">{calculateSample(3, 300).toFixed(2)}</p>
                            </div>
                            <div className="rounded bg-secondary p-2">
                                <p className="text-muted-foreground">Rating 7</p>
                                <p className="text-lg font-bold">{calculateSample(7, 300).toFixed(2)}</p>
                            </div>
                            <div className="rounded bg-secondary p-2">
                                <p className="text-muted-foreground">Rating 9</p>
                                <p className="text-lg font-bold">{calculateSample(9, 300).toFixed(2)}</p>
                            </div>
                        </div>
                        <p className="mt-2 text-center text-xs text-muted-foreground">At ₹300 cost</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
