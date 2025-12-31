"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import type { Aspect } from "@/types";


const CATEGORIES = [
    { value: "narrative", label: "Narrative" },
    { value: "technical", label: "Technical" },
    { value: "performance", label: "Performance" },
];

export default function AspectsPage() {
    const [aspects, setAspects] = useState<Aspect[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingAspect, setEditingAspect] = useState<Aspect | null>(null);
    const [deletingAspect, setDeletingAspect] = useState<Aspect | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        supabase.from("aspects").select("*").order("category").order("name").then(({ data }) => {
            setAspects(data || []);
            setIsLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            toast.error("Authentication required");
            setIsSubmitting(false);
            return;
        }

        try {
            const { data, error } = await supabase.from("aspects").insert({
                user_id: user.id,
                name: formData.get("name") as string,
                category: (formData.get("category") as string) || "technical",
            } as any).select().single();

            if (error) throw error;
            setAspects([...aspects, data as Aspect]);
            toast.success("Aspect added!");
            setIsAddDialogOpen(false);
        } catch {
            toast.error("Failed to add aspect");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingAspect) return;
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            const { data, error } = await supabase.from("aspects").update({
                name: formData.get("name") as string,
                category: formData.get("category") as string,
            } as never).eq("id", editingAspect.id).select().single();

            if (error) throw error;
            setAspects(aspects.map(a => a.id === editingAspect.id ? data as Aspect : a));
            toast.success("Aspect updated!");
            setEditingAspect(null);
        } catch {
            toast.error("Failed to update aspect");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingAspect) return;
        setIsSubmitting(true);
        try {
            await supabase.from("aspects").delete().eq("id", deletingAspect.id);
            setAspects(aspects.filter(a => a.id !== deletingAspect.id));
            toast.success("Aspect deleted");
            setDeletingAspect(null);
        } catch {
            toast.error("Failed to delete aspect");
        } finally {
            setIsSubmitting(false);
        }
    };

    const AspectForm = ({ aspect, onSubmit }: { aspect?: Aspect; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required defaultValue={aspect?.name} placeholder="e.g., Cinematography" className="mt-1" />
            </div>
            <div>
                <Label>Category</Label>
                <Select name="category" defaultValue={aspect?.category || "narrative"}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : aspect ? "Save Changes" : "Add Aspect"}
            </Button>
        </form>
    );

    const groupedAspects = CATEGORIES.map(cat => ({
        ...cat,
        aspects: aspects.filter(a => a.category === cat.value),
    })).filter(g => g.aspects.length > 0);

    return (
        <div className="min-h-screen">
            <PageHeader title="Aspects" showBack action={
                <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}><Plus className="h-5 w-5" /></Button>
            } />

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent><DialogHeader><DialogTitle>Add Aspect</DialogTitle></DialogHeader><AspectForm onSubmit={handleAdd} /></DialogContent>
            </Dialog>

            <Dialog open={!!editingAspect} onOpenChange={(open) => !open && setEditingAspect(null)}>
                <DialogContent><DialogHeader><DialogTitle>Edit Aspect</DialogTitle></DialogHeader>{editingAspect && <AspectForm aspect={editingAspect} onSubmit={handleUpdate} />}</DialogContent>
            </Dialog>

            <AlertDialog open={!!deletingAspect} onOpenChange={(open) => !open && setDeletingAspect(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete Aspect?</AlertDialogTitle><AlertDialogDescription>Delete &quot;{deletingAspect?.name}&quot;?</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="space-y-6 p-4">
                {isLoading ? <Skeleton className="h-40" /> : groupedAspects.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No aspects yet</div>
                ) : groupedAspects.map(group => (
                    <section key={group.value}>
                        <h2 className="mb-2 text-sm font-medium text-muted-foreground">{group.label}</h2>
                        <div className="space-y-2">
                            {group.aspects.map(aspect => (
                                <Card key={aspect.id}>
                                    <CardContent className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2">
                                            <span>{aspect.name}</span>
                                            <Badge variant="secondary" className="text-xs">{aspect.category}</Badge>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingAspect(aspect)}><Pencil className="h-3 w-3" /></Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingAspect(aspect)}><Trash2 className="h-3 w-3" /></Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
