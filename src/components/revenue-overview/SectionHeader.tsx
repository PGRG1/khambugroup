interface Props {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: Props) {
  return (
    <div className="mt-8 mb-3">
      <div className="shrink-0">
        <div className="text-sm font-semibold leading-tight text-foreground">{title}</div>
        {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
      </div>
    </div>
  );
}
