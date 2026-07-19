import { getHomeData } from "@/lib/server/home-data";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const data = await getHomeData();
  return <DashboardClient {...data} />;
}
