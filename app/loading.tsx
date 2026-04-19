export default function DashboardLoading() {
  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-14 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-8 w-52 rounded bg-gray-300 animate-pulse" />
          <div className="h-3 w-80 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-8 w-24 rounded-lg bg-gray-200 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-20 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-7 w-20 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="mb-6 flex flex-col lg:flex-row gap-4">
        {/* Per Landholding */}
        <div className="flex-[4] min-w-0 bg-emerald-50 rounded-xl p-3">
          <div className="h-2.5 w-36 rounded-full bg-emerald-200 animate-pulse mb-3" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card-bezel h-full">
                <div className="card-bezel-inner h-full border-t-4 border-t-gray-200 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-2.5 w-20 rounded bg-gray-200 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse mt-0.5" />
                  </div>
                  <div className="h-8 w-24 rounded bg-gray-300 animate-pulse mb-2" />
                  <div className="h-2.5 w-full rounded bg-gray-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per ARB */}
        <div className="flex-[2] min-w-0 bg-orange-50 rounded-xl p-3">
          <div className="h-2.5 w-28 rounded-full bg-orange-200 animate-pulse mb-3" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="card-bezel h-full">
                <div className="card-bezel-inner h-full border-t-4 border-t-gray-200 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-2.5 w-16 rounded bg-gray-200 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse mt-0.5" />
                  </div>
                  <div className="h-8 w-20 rounded bg-gray-300 animate-pulse mb-2" />
                  <div className="h-2.5 w-full rounded bg-gray-200 animate-pulse mb-1" />
                  <div className="h-2.5 w-3/4 rounded bg-gray-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Issue Strip ── */}
      <div className="card-bezel mb-6">
        <div className="card-bezel-inner-open">
          <div className="flex items-center justify-between mb-3">
            <div className="h-2.5 w-36 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-2.5 w-20 rounded-full bg-gray-200 animate-pulse" />
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-200 animate-pulse mb-4" />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-gray-200 animate-pulse" />
                <div className="h-3 w-8 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-28 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
        {/* Records per Province */}
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-green-900 px-4 py-2.5">
              <div className="h-2.5 w-44 rounded bg-green-700 animate-pulse" />
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {[85, 60, 75, 45, 90, 55].map((w, i) => (
                <div
                  key={i}
                  className="h-5 rounded bg-gray-200 animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Records by Status */}
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-green-900 px-4 py-2.5 flex items-center justify-between">
              <div className="h-2.5 w-36 rounded bg-green-700 animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 rounded-md bg-green-700 animate-pulse" />
                <div className="h-6 w-6 rounded-md bg-green-700 animate-pulse" />
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {[95, 30, 20, 15, 12].map((w, i) => (
                <div
                  key={i}
                  className="h-5 rounded bg-gray-200 animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── COCROM Charts Row ── */}
      <div className="card-bezel mb-6">
        <div className="card-bezel-inner">
          <div className="bg-green-900 px-4 py-2.5">
            <div className="h-2.5 w-52 rounded bg-green-700 animate-pulse" />
          </div>
          <div className="p-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-32 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-32 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── Accomplishment Tracker ── */}
      <div className="mt-8 mb-6">
        {/* Header — NO card-bezel here */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-44 rounded bg-gray-300 animate-pulse" />
            <div className="h-2.5 w-64 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg self-start">
            <div className="h-7 w-14 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-7 w-16 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-7 w-20 rounded-md bg-gray-200 animate-pulse" />
          </div>
        </div>
        {/* 3 sub-cards in grid — each has card-bezel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-bezel">
              <div className="card-bezel-inner">
                <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
                  <div className="h-2 w-20 rounded bg-green-700 animate-pulse" />
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="h-24 w-full rounded-lg bg-gray-200 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Not Eligible for Encoding ── */}
      <div className="mt-6">
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-green-900 px-4 py-2.5">
              <div className="h-2.5 w-64 rounded bg-green-700 animate-pulse" />
            </div>
            <div className="p-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="h-2.5 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="flex flex-col gap-2.5">
                  {[85, 60, 75, 45, 90].map((w, i) => (
                    <div
                      key={i}
                      className="h-5 rounded bg-gray-200 animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="h-2.5 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="flex flex-col gap-2.5">
                  {[70, 50, 65, 40, 55].map((w, i) => (
                    <div
                      key={i}
                      className="h-5 rounded bg-gray-200 animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
