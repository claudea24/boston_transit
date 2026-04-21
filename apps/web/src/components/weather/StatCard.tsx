export default function StatCard({
  label,
  icon,
  children,
  footer,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="glass-card p-4 flex flex-col gap-2 min-h-[130px]">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/60">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-1">{children}</div>
      {footer && <div className="text-xs text-white/50">{footer}</div>}
    </div>
  );
}
