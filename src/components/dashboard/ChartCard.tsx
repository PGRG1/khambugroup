import { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}

const ChartCard = ({ title, subtitle, children, className = "", headerRight }: ChartCardProps) => (
  <div className={`card-glass rounded-xl p-5 animate-fade-in ${className}`}>
    <div className="flex items-start justify-between gap-2 mb-1">
      <div>
        <h3 className="text-sm font-display font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {headerRight}
    </div>
    {!subtitle && !headerRight && <div className="mb-2" />}
    {(subtitle || headerRight) && <div className="mb-3" />}
    {children}
  </div>
);

export default ChartCard;
