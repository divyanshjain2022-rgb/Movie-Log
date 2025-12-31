"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useFormats } from "@/hooks";
import { toast } from "sonner";
import type { Format } from "@/types";

export default function FormatsPage() {
    const { formats, isLoading, addFormat, updateFormat, deleteFormat } = useFormats();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingFormat, setEditingFormat] = useState<Format | null>(null);
    const [deletingFormat, setDeletingFormat] = useState<Format | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            await addFormat({
                user_id: "", // Set by RLS
                name: formData.get("name") as string,
                weight: parseFloat(formData.get("weight") as string) || 1.0,
                sort_order: formats.length,
            });
            toast.success("Format added!");
            setIsAddDialogOpen(false);
        } catch {
            toast.error("Failed to add format");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingFormat) return;
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            await updateFormat(editingFormat.id, {
                name: formData.get("name") as string,
                weight: parseFloat(formData.get("weight") as string) || 1.0,
            });
            toast.success("Format updated!");
            setEditingFormat(null);
        } catch {
            toast.error("Failed to update format");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingFormat) return;
        setIsSubmitting(true);

        try {
            await deleteFormat(deletingFormat.id);
            toast.success("Format deleted");
            setDeletingFormat(null);
        } catch {
            toast.error("Failed to delete format");
        } finally {
            setIsSubmitting(false);
        }
    };

    const FormatForm = ({ format, onSubmit }: { format?: Format; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div>
                <Label htmlFor="name">Name</Label>
                <Input
                    id="name"
                    name="name"
                    required
                    defaultValue={format?.name}
                    placeholder="e.g., IMAX 3D"
                    className="mt-1"
                />
            </div>
            <div>
                <Label htmlFor="weight">Weight (for value score)</Label>
                <Input
                    id="weight"
                    name="weight"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5"
                    defaultValue={format?.weight || 1.0}
                    className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                    Higher weight = higher expected value. Default is 1.0
                </p>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : format ? "Save Changes" : "Add Format"}
            </Button>
        </form>
    );

    return (
        <div className="min-h-screen">
            <PageHeader
                title="Formats"
                showBack
                action={
                    <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="h-5 w-5" />
                    </Button>
                }
            />

            {/* Add Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Format</DialogTitle>
                    </DialogHeader>
                    <FormatForm onSubmit={handleAdd} />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingFormat} onOpenChange={(open) => !open && setEditingFormat(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Format</DialogTitle>
                    </DialogHeader>
                    {editingFormat && <FormatForm format={editingFormat} onSubmit={handleUpdate} />}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingFormat} onOpenChange={(open) => !open && setDeletingFormat(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Format?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete &quot;{deletingFormat?.name}&quot;. Movies using this format will have it unset.
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
                    <div className="space-y-2">
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                    </div>
                ) : formats.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                        <p className="text-muted-foreground">No formats yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Add formats like IMAX 2D, 3D, Dolby Atmos, etc.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {formats.map((format) => (
                            <Card key={format.id}>
                                <CardContent className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">{format.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Weight: {format.weight?.toFixed(1) || "1.0"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setEditingFormat(format)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                            onClick={() => setDeletingFormat(format)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
