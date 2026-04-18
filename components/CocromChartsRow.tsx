"use client";

import { useState } from "react";
import {
  CocromEncodingChart,
  CocromDistributionChart,
  type CocromChartMode,
  type CocromEncodingData,
  type CocromDistributionRow,
  type CocromSourceRow,
  type CocromDistNotEligible,
} from "@/components/DashboardCharts";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div className="bg-green-900 px-4 py-2.5">
        <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}

export function CocromChartsRow({
  encodingData,
  encodingSourceLandholdings,
  distributionData,
  distributionSourceLandholdings,
  distributionNotEligible,
  distributionTotals,
}: {
  encodingData: CocromEncodingData;
  encodingSourceLandholdings: CocromSourceRow[];
  distributionData: CocromDistributionRow[];
  distributionSourceLandholdings: CocromSourceRow[];
  distributionNotEligible: CocromDistNotEligible;
  distributionTotals: { cocrom: number; arbs: number; area: number; amount: number };
}) {
  const [mode, setMode] = useState<CocromChartMode>("cocrom");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCard title={'Status of Encoding (landholding under "For Encoding" status and above only)'}>
        <CocromEncodingChart
          data={encodingData}
          sourceLandholdings={encodingSourceLandholdings}
          mode={mode}
          onModeChange={setMode}
        />
      </ChartCard>
      <ChartCard title={'Status of Distribution (Landholdings w/ Status "Partially and Fully Distributed" only)'}>
        <CocromDistributionChart
          data={distributionData}
          sourceLandholdings={distributionSourceLandholdings}
          notEligible={distributionNotEligible}
          totals={distributionTotals}
          mode={mode}
          onModeChange={setMode}
        />
      </ChartCard>
    </div>
  );
}
