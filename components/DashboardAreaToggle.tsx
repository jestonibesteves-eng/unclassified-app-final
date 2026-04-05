"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function DashboardAreaToggle({ current }: { current: "validated" | "original" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "validated") params.delete("area");
    else params.set("area", val);
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 text-[11px] flex-shrink-0">
      <button
        onClick={() => toggle("validated")}
        className={`px-4 py-1.5 rounded-md font-semibold transition-all duration-200 whitespace-nowrap ${
          current === "validated"
            ? "bg-white text-amber-700 shadow-sm border border-amber-200"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Validated Area
      </button>
      <button
        onClick={() => toggle("original")}
        className={`px-4 py-1.5 rounded-md font-semibold transition-all duration-200 whitespace-nowrap ${
          current === "original"
            ? "bg-white text-gray-700 shadow-sm border border-gray-200"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Original Area
      </button>
    </div>
  );
}
