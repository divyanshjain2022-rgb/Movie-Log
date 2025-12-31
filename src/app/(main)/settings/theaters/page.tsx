"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
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
import { useTheaters } from "@/hooks";
import { toast } from "sonner";
import type { Theater } from "@/types";

export default function TheatersPage() {
    const { theaters, isLoading, addTheater, updateTheater, deleteTheater } = useTheaters();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingTheater, setEditingTheater] = useState<Theater | null>(null);
    const [deletingTheater, setDeletingTheater] = useState<Theater | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            toast.error("You must be logged in to add data");
            setIsSubmitting(false);
            return;
        }

        try {
            await addTheater({
                user_id: user.id,
                name: formData.get("name") as string,
                city: (formData.get("city") as string) || null,
                has_imax: formData.get("has_imax") === "on",
                has_4dx: formData.get("has_4dx") === "on",
                notes: (formData.get("notes") as string) || null,
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

        try {
            await updateTheater(editingTheater.id, {
                name: formData.get("name") as string,
                city: (formData.get("city") as string) || null,
                has_imax: formData.get("has_imax") === "on",
                has_4dx: formData.get("has_4dx") === "on",
                notes: (formData.get("notes") as string) || null,
            });
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

    const TheaterForm = ({ theater, onSubmit }: { theater?: Theater; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
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
                <Label htmlFor="notes">Notes</Label>
                <Input
                    id="notes"
                    name="notes"
                    defaultValue={theater?.notes || ""}
                    placeholder="Any notes..."
                    className="mt-1"
                />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : theater ? "Save Changes" : "Add Theater"}
            </Button>
        </form>
    );

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
                    <div className="space-y-2">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                    </div>
                ) : theaters.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                        <MapPin className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-3 text-muted-foreground">No theaters yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {theaters.map((theater) => (
                            <Card key={theater.id}>
                                <CardContent className="flex items-center justify-between p-4">
                                    <div>
                                        <p className="font-medium">{theater.name}</p>
                                        {theater.city && (
                                            <p className="text-sm text-muted-foreground">{theater.city}</p>
                                        )}
                                        <div className="mt-1 flex gap-1">
                                            {theater.has_imax && <Badge variant="secondary" className="text-xs">IMAX</Badge>}
                                            {theater.has_4dx && <Badge variant="secondary" className="text-xs">4DX</Badge>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTheater(theater)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingTheater(theater)}>
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
