"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { Mood } from "@/types";

export default function MoodsPage() {
    const [moods, setMoods] = useState<Mood[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingMood, setEditingMood] = useState<Mood | null>(null);
    const [deletingMood, setDeletingMood] = useState<Mood | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supabase = createClient();

    const fetchMoods = async () => {
        const { data } = await supabase.from("moods").select("*").order("sort_order");
        setMoods(data || []);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchMoods();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { data, error } = await supabase.from("moods").insert({
                user_id: user.id,
                name: formData.get("name") as string,
                emoji: (formData.get("emoji") as string) || null,
                sentiment: formData.get("sentiment") as string,
                sort_order: moods.length,
            } as never).select().single();

            if (error) throw error;
            setMoods([...moods, data as Mood]);
            toast.success("Mood added!");
            setIsAddDialogOpen(false);
        } catch {
            toast.error("Failed to add mood");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingMood) return;
        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);

        try {
            const { data, error } = await supabase.from("moods").update({
                name: formData.get("name") as string,
                emoji: (formData.get("emoji") as string) || null,
                sentiment: formData.get("sentiment") as string,
            } as never).eq("id", editingMood.id).select().single();

            if (error) throw error;
            setMoods(moods.map(m => m.id === editingMood.id ? data as Mood : m));
            toast.success("Mood updated!");
            setEditingMood(null);
        } catch {
            toast.error("Failed to update mood");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingMood) return;
        setIsSubmitting(true);

        try {
            const { error } = await supabase.from("moods").delete().eq("id", deletingMood.id);
            if (error) throw error;
            setMoods(moods.filter(m => m.id !== deletingMood.id));
            toast.success("Mood deleted");
            setDeletingMood(null);
        } catch {
            toast.error("Failed to delete mood");
        } finally {
            setIsSubmitting(false);
        }
    };

    const MoodForm = ({ mood, onSubmit }: { mood?: Mood; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required defaultValue={mood?.name} placeholder="e.g., Satisfied" className="mt-1" />
            </div>
            <div>
                <Label htmlFor="emoji">Emoji (optional)</Label>
                <Input id="emoji" name="emoji" defaultValue={mood?.emoji || ""} placeholder="😊" className="mt-1" maxLength={4} />
            </div>
            <div>
                <Label>Sentiment</Label>
                <Select name="sentiment" defaultValue={mood?.sentiment || "neutral"}>
                    <SelectTrigger className="mt-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="positive">Positive</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="negative">Negative</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : mood ? "Save Changes" : "Add Mood"}
            </Button>
        </form>
    );

    const getSentimentColor = (sentiment: string | null) => {
        if (sentiment === "positive") return "text-positive";
        if (sentiment === "negative") return "text-negative";
        return "text-muted-foreground";
    };

    return (
        <div className="min-h-screen">
            <PageHeader title="Moods" showBack action={
                <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="h-5 w-5" />
                </Button>
            } />

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add Mood</DialogTitle></DialogHeader>
                    <MoodForm onSubmit={handleAdd} />
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingMood} onOpenChange={(open) => !open && setEditingMood(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit Mood</DialogTitle></DialogHeader>
                    {editingMood && <MoodForm mood={editingMood} onSubmit={handleUpdate} />}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deletingMood} onOpenChange={(open) => !open && setDeletingMood(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Mood?</AlertDialogTitle>
                        <AlertDialogDescription>Delete &quot;{deletingMood?.name}&quot;?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isSubmitting} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="p-4">
                {isLoading ? (
                    <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
                ) : moods.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No moods yet</div>
                ) : (
                    <div className="space-y-3">
                        {moods.map((mood) => (
                            <Card key={mood.id}>
                                <CardContent className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        {mood.emoji && <span className="text-xl">{mood.emoji}</span>}
                                        <div>
                                            <p className="font-medium">{mood.name}</p>
                                            <p className={`text-sm ${getSentimentColor(mood.sentiment)}`}>{mood.sentiment}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingMood(mood)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingMood(mood)}><Trash2 className="h-4 w-4" /></Button>
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
