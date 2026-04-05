import { Suspense } from "react";
import RecordsTable from "@/components/RecordsTable";

export default function RecordsPage() {
  return (
    <div className="page-enter">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-800">Records Browser</h2>
        <p className="text-sm text-gray-500 mt-1">
          Region V Unclassified ARRs — Search, filter, and view all landholdings
        </p>
      </div>
      <Suspense fallback={<div className="text-gray-400 text-sm">Loading records...</div>}>
        <RecordsTable />
      </Suspense>
    </div>
  );
}
