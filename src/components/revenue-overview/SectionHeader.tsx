interface Props {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: Props) {
  return (
    <div className="mt-8 mb-3 flex items-baseline gap-3">
      <div className="shrink-0">
        <div className="text-[13px] font-semibold leading-tight">{title}</div>
        {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
      </div>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}
