export default function Loading() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-50/60 backdrop-blur-[2px] pointer-events-none"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
        <div className="h-3.5 w-24 rounded-full bg-slate-200 animate-pulse" />
      </div>
    </div>
  );
}

