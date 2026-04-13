"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function DashboardProvinceFilter({
  provinces,
  selected,
}: {
  provinces: string[];
  selected: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(newSelected: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (newSelected.length === 0) params.delete("provinces");
    else params.set("provinces", newSelected.join(","));
    router.push(`${pathname}?${params}`);
  }

  function handleClick(province: string, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      const next = selected.includes(province)
        ? selected.filter((p) => p !== province)
        : [...selected, province];
      update(next);
    } else {
      // Single click: select only this one, or clear if already the sole selection
      update(selected.length === 1 && selected[0] === province ? [] : [province]);
    }
  }

  return (
    <div className="card-bezel mb-6">
      <div className="card-bezel-inner-open">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.13em] font-semibold text-gray-400">
            Filter by Province
          </span>
          {selected.length > 0 && (
            <span className="text-[10px] text-green-700 font-semibold bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              {selected.length} selected
            </span>
          )}
          {selected.length > 0 && (
            <button
              onClick={() => update([])}
              className="ml-auto text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear filter ×
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => update([])}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all duration-150 active:scale-[0.97] ${
              selected.length === 0
                ? "bg-green-900 border-green-900 text-white shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {provinces.map((province) => {
            const active = selected.includes(province);
            return (
              <button
                key={province}
                onClick={(e) => handleClick(province, e)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all duration-150 active:scale-[0.97] select-none ${
                  active
                    ? "bg-green-900 border-green-900 text-white shadow-sm"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-green-50 hover:border-green-300"
                }`}
              >
                {province}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-gray-300 mt-2.5">
          Click to filter · <kbd className="font-mono">Ctrl</kbd> + click to select multiple
        </p>
      </div>
    </div>
  );
}
