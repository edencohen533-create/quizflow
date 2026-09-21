"use client";

import dynamic from "next/dynamic";

// Wraps the recharts-based chart so the dashboard's Server Component page
// can lazy-load it (next/dynamic with ssr:false can only be called from a
// Client Component) — keeps recharts out of the very first page every user
// sees until the chart itself is actually about to render.
export const LeadsChart = dynamic(() => import("./leads-chart").then((m) => m.LeadsChart), {
  ssr: false,
  loading: () => <div className="h-[260px]" />,
});
