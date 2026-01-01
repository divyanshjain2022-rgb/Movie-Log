"use client";

import { useState, useEffect } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { RewatchOption } from "@/types";

export default function RewatchPage() {
    const [options, setOptions] = useState<RewatchOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingOption, setEditingOption] = useState<RewatchOption | null>(null);
    const [deletingOption, setDeletingOption] = useState<RewatchOption | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        supabase.from("rewatch_options").select("*").order("sort_order").then(({ data }) => {
            setOptions(data || []);
            setIsLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            const { data, error } = await supabase.from("rewatch_options").insert({
                user_id: "",
                name: formData.get("name") as string,
                value: parseInt(formData.get("value") as string) || 0,
                sort_order: options.length,
            } as never).select().single();

            if (error) throw error;
            setOptions([...options, data as RewatchOption]);
            toast.success("Option added!");
            setIsAddDialogOpen(false);
        } catch {
            toast.error("Failed to add option");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingOption) return;
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            const { data, error } = await supabase.from("rewatch_options").update({
                name: formData.get("name") as string,
                value: parseInt(formData.get("value") as string) || 0,
            } as never).eq("id", editingOption.id).select().single();

            if (error) throw error;
            setOptions(options.map(o => o.id === editingOption.id ? data as RewatchOption : o));
            toast.success("Option updated!");
            setEditingOption(null);
        } catch {
            toast.error("Failed to update option");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingOption) return;
        setIsSubmitting(true);
        try {
            await supabase.from("rewatch_options").delete().eq("id", deletingOption.id);
            setOptions(options.filter(o => o.id !== deletingOption.id));
            toast.success("Option deleted");
            setDeletingOption(null);
        } catch {
            toast.error("Failed to delete option");
        } finally {
            setIsSubmitting(false);
        }
    };

    const OptionForm = ({ option, onSubmit }: { option?: RewatchOption; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required defaultValue={option?.name} placeholder="e.g., Definitely" className="mt-1" />
            </div>
            <div>
                <Label htmlFor="value">Value (for sorting)</Label>
                <Input id="value" name="value" type="number" defaultValue={option?.value || 0} className="mt-1" />
                <p className="mt-1 text-xs text-muted-foreground">Higher value = more likely to rewatch</p>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : option ? "Save Changes" : "Add Option"}
            </Button>
        </form>
    );

    return (
        <div className="min-h-screen">
            <PageHeader title="Rewatch Options" showBack action={
                <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}><Plus className="h-5 w-5" /></Button>
            } />

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent><DialogHeader><DialogTitle>Add Rewatch Option</DialogTitle></DialogHeader><OptionForm onSubmit={handleAdd} /></DialogContent>
            </Dialog>

            <Dialog open={!!editingOption} onOpenChange={(open) => !open && setEditingOption(null)}>
                <DialogContent><DialogHeader><DialogTitle>Edit Rewatch Option</DialogTitle></DialogHeader>{editingOption && <OptionForm option={editingOption} onSubmit={handleUpdate} />}</DialogContent>
            </Dialog>

            <AlertDialog open={!!deletingOption} onOpenChange={(open) => !open && setDeletingOption(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete Option?</AlertDialogTitle><AlertDialogDescription>Delete &quot;{deletingOption?.name}&quot;?</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="p-4">
                {isLoading ? <Skeleton className="h-40" /> : options.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No options yet</div>
                ) : (
                    <div className="space-y-2">
                        {options.map(option => (
                            <Card key={option.id}>
                                <CardContent className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">{option.name}</p>
                                            <p className="text-sm text-muted-foreground">Value: {option.value}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingOption(option)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingOption(option)}><Trash2 className="h-4 w-4" /></Button>
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
