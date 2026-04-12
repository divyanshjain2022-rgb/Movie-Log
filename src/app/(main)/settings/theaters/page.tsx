"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, MapPin, Star, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared";
import { useFormats, useTheaters, useTheaterRatings } from "@/hooks";
import { computeTheaterAvgRatings } from "@/hooks/use-theater-ratings";
import {
    formatAudiDisplay,
    normalizeAudiDefaultsByFormat,
    normalizeAudiValue,
    type AudiDefaultsByFormat,
} from "@/lib/audi";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Format, Theater } from "@/types";

function buildDefaultAudiByFormat(formData: FormData, formats: Format[]): AudiDefaultsByFormat {
    const defaults: AudiDefaultsByFormat = {};

    for (const format of formats) {
        const normalizedAudi = normalizeAudiValue(
            formData.get(`default_audi_${format.id}`) as string | null
        );

        if (normalizedAudi) {
            defaults[format.id] = normalizedAudi;
        }
    }

    return defaults;
}

export default function TheatersPage() {
    const { theaters, isLoading, addTheater, updateTheater, deleteTheater } = useTheaters();
    const { formats, isLoading: areFormatsLoading } = useFormats();
    const { ratings: allRatings } = useTheaterRatings();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingTheater, setEditingTheater] = useState<Theater | null>(null);
    const [deletingTheater, setDeletingTheater] = useState<Theater | null>(null);
    const [expandedTheater, setExpandedTheater] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        const capabilitiesStr = formData.get("capabilities") as string;
        const capabilities = capabilitiesStr
            ? capabilitiesStr.split(",").map(c => c.trim()).filter(Boolean)
            : [];

        if (areFormatsLoading) {
            toast.error("Formats are still loading");
            setIsSubmitting(false);
            return;
        }

        const defaultAudiByFormat = buildDefaultAudiByFormat(formData, formats);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            await addTheater({
                user_id: user.id,
                name: formData.get("name") as string,
                city: (formData.get("city") as string) || null,
                has_imax: formData.get("has_imax") === "on",
                has_4dx: formData.get("has_4dx") === "on",
                notes: (formData.get("notes") as string) || null,
                capabilities,
                default_audi_by_format: defaultAudiByFormat,
            });
            toast.success("Theater added!");
            setIsAddDialogOpen(false);
        } catch {
            toast.error("Failed to add theater");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingTheater) return;
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        const updateCapStr = formData.get("capabilities") as string;
        const updateCapabilities = updateCapStr
            ? updateCapStr.split(",").map(c => c.trim()).filter(Boolean)
            : [];

        if (areFormatsLoading) {
            toast.error("Formats are still loading");
            setIsSubmitting(false);
            return;
        }

        const defaultAudiByFormat = buildDefaultAudiByFormat(formData, formats);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            await updateTheater(editingTheater.id, {
                name: formData.get("name") as string,
                city: (formData.get("city") as string) || null,
                has_imax: formData.get("has_imax") === "on",
                has_4dx: formData.get("has_4dx") === "on",
                notes: (formData.get("notes") as string) || null,
                capabilities: updateCapabilities,
                default_audi_by_format: defaultAudiByFormat,
            });

            const movieUpdates = Object.entries(defaultAudiByFormat).map(([formatId, audi]) =>
                supabase
                    .from("movies")
                    .update({ audi } as never)
                    .eq("user_id", user.id)
                    .eq("theater_id", editingTheater.id)
                    .eq("format_id", formatId)
            );

            const movieResults = await Promise.all(movieUpdates);
            for (const result of movieResults) {
                if (result.error) throw result.error;
            }

            toast.success("Theater updated!");
            setEditingTheater(null);
        } catch {
            toast.error("Failed to update theater");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingTheater) return;
        setIsSubmitting(true);

        try {
            await deleteTheater(deletingTheater.id);
            toast.success("Theater deleted");
            setDeletingTheater(null);
        } catch {
            toast.error("Failed to delete theater");
        } finally {
            setIsSubmitting(false);
        }
    };

    const TheaterForm = ({ theater, onSubmit }: { theater?: Theater; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => {
        const theaterAudiDefaults = normalizeAudiDefaultsByFormat(theater?.default_audi_by_format);

        return (
            <form onSubmit={onSubmit} className="space-y-4">
                <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                        id="name"
                        name="name"
                        required
                        defaultValue={theater?.name}
                        placeholder="e.g., Phoenix Pallassio"
                        className="mt-1"
                    />
                </div>
                <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                        id="city"
                        name="city"
                        defaultValue={theater?.city || ""}
                        placeholder="e.g., Lucknow"
                        className="mt-1"
                    />
                </div>
                <div className="flex gap-6">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            name="has_imax"
                            defaultChecked={theater?.has_imax}
                            className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm">Has IMAX</span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            name="has_4dx"
                            defaultChecked={theater?.has_4dx}
                            className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm">Has 4DX</span>
                    </label>
                </div>
                <div>
                    <Label htmlFor="capabilities">Capabilities</Label>
                    <Input
                        id="capabilities"
                        name="capabilities"
                        defaultValue={theater?.capabilities?.join(", ") || ""}
                        placeholder="PXL, MX4D, Dolby Atmos, ScreenX, Kotak Insignia..."
                        className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Comma-separated list of formats/features</p>
                </div>
                <div className="space-y-3">
                    <div>
                        <Label>Screen Defaults By Format</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                            These theater-specific overrides beat the format-wide fallback when this theater is selected.
                        </p>
                    </div>
                    {areFormatsLoading ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                            Loading formats...
                        </p>
                    ) : formats.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                            Add formats first to save theater-specific screens.
                        </p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {formats.map((format) => {
                                const formatFallback = formatAudiDisplay(format.default_audi);

                                return (
                                    <div key={format.id}>
                                        <Label htmlFor={`default_audi_${format.id}`}>{format.name}</Label>
                                        <Input
                                            id={`default_audi_${format.id}`}
                                            name={`default_audi_${format.id}`}
                                            defaultValue={theaterAudiDefaults[format.id] || ""}
                                            placeholder={format.default_audi || "6"}
                                            className="mt-1"
                                        />
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {formatFallback
                                                ? `Format fallback: ${formatFallback}`
                                                : "Leave blank to use the format-wide fallback."}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                        id="notes"
                        name="notes"
                        defaultValue={theater?.notes || ""}
                        placeholder="Any notes..."
                        className="mt-1"
                    />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting || areFormatsLoading}>
                    {isSubmitting ? "Saving..." : theater ? "Save Changes" : "Add Theater"}
                </Button>
            </form>
        );
    };

    return (
        <div className="min-h-screen">
            <PageHeader
                title="Theaters"
                showBack
                action={
                    <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="h-5 w-5" />
                    </Button>
                }
            />

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Theater</DialogTitle>
                    </DialogHeader>
                    <TheaterForm onSubmit={handleAdd} />
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingTheater} onOpenChange={(open) => !open && setEditingTheater(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Theater</DialogTitle>
                    </DialogHeader>
                    {editingTheater && <TheaterForm theater={editingTheater} onSubmit={handleUpdate} />}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deletingTheater} onOpenChange={(open) => !open && setDeletingTheater(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Theater?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete &quot;{deletingTheater?.name}&quot;.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isSubmitting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="p-4">
                {isLoading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                    </div>
                ) : theaters.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                        <MapPin className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-3 text-muted-foreground">No theaters yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {theaters.map((theater) => {
                            const theaterRatings = allRatings.filter(r => r.theater_id === theater.id);
                            const avg = computeTheaterAvgRatings(theaterRatings);
                            const isExpanded = expandedTheater === theater.id;
                            const theaterAudiDefaults = normalizeAudiDefaultsByFormat(theater.default_audi_by_format);
                            const savedDefaultLabels = formats.flatMap((format) => {
                                const savedAudi = theaterAudiDefaults[format.id];
                                if (!savedAudi) return [];
                                return [`${format.name}: ${formatAudiDisplay(savedAudi) || savedAudi}`];
                            });

                            return (
                                <Card key={theater.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium">{theater.name}</p>
                                                    {avg.count > 0 && (
                                                        <div className="flex items-center gap-0.5 text-xs text-yellow-400">
                                                            <Star className="h-3 w-3 fill-yellow-400" />
                                                            <span className="font-medium">{avg.overall.toFixed(1)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {theater.city && (
                                                    <p className="text-sm text-muted-foreground">{theater.city}</p>
                                                )}
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {theater.has_imax && <Badge variant="secondary" className="text-xs">IMAX</Badge>}
                                                    {theater.has_4dx && <Badge variant="secondary" className="text-xs">4DX</Badge>}
                                                    {theater.capabilities?.map((cap) => (
                                                        <Badge key={cap} variant="outline" className="text-xs">{cap}</Badge>
                                                    ))}
                                                </div>
                                                {savedDefaultLabels.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {savedDefaultLabels.map((label) => (
                                                            <Badge key={label} variant="outline" className="text-xs">
                                                                {label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {avg.count > 0 && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => setExpandedTheater(isExpanded ? null : theater.id)}
                                                    >
                                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTheater(theater)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingTheater(theater)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Expanded ratings detail */}
                                        {isExpanded && avg.count > 0 && (
                                            <div className="mt-3 space-y-2 border-t pt-3">
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    Average Ratings ({avg.count} {avg.count === 1 ? "review" : "reviews"})
                                                </p>
                                                {[
                                                    { label: "Sound", value: avg.sound },
                                                    { label: "Seats", value: avg.seat },
                                                    { label: "Screen", value: avg.screen },
                                                    { label: "Cleanliness", value: avg.cleanliness },
                                                ].map(({ label, value }) => (
                                                    <div key={label} className="flex items-center justify-between text-sm">
                                                        <span className="text-muted-foreground">{label}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="flex gap-0.5">
                                                                {[1, 2, 3, 4, 5].map((s) => (
                                                                    <Star
                                                                        key={s}
                                                                        className={cn(
                                                                            "h-3.5 w-3.5",
                                                                            s <= Math.round(value)
                                                                                ? "fill-yellow-400 text-yellow-400"
                                                                                : "text-muted-foreground/20"
                                                                        )}
                                                                    />
                                                                ))}
                                                            </div>
                                                            <span className="text-xs font-medium w-6 text-right">
                                                                {value > 0 ? value.toFixed(1) : "–"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Per-audi breakdown if multiple audis */}
                                                {(() => {
                                                    const audis = [
                                                        ...new Set(
                                                            theaterRatings
                                                                .map(r => normalizeAudiValue(r.audi))
                                                                .filter(Boolean)
                                                        ),
                                                    ] as string[];
                                                    if (audis.length <= 1) return null;
                                                    return (
                                                        <div className="mt-2 space-y-1.5">
                                                            <p className="text-xs font-medium text-muted-foreground">By Audi</p>
                                                            {audis.map(audi => {
                                                                const audiRatings = theaterRatings.filter(
                                                                    r => normalizeAudiValue(r.audi) === audi
                                                                );
                                                                const audiAvg = computeTheaterAvgRatings(audiRatings);
                                                                return (
                                                                    <div key={audi} className="flex items-center justify-between text-xs">
                                                                        <span>{formatAudiDisplay(audi) || audi}</span>
                                                                        <div className="flex items-center gap-1">
                                                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                                                            <span className="font-medium">{audiAvg.overall.toFixed(1)}</span>
                                                                            <span className="text-muted-foreground">({audiRatings.length})</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
