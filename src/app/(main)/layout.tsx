import { BottomNav } from "@/components/shared";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}
