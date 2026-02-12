import { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

const ChartCard = ({ title, subtitle, children, className = "" }: ChartCardProps) => (
  <div className={`card-glass rounded-xl p-5 animate-fade-in ${className}`}>
    <h3 className="text-sm font-display font-semibold text-foreground mb-1">{title}</h3>
    {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
    {!subtitle && <div className="mb-3" />}
    {children}
  </div>
);

export default ChartCard;
