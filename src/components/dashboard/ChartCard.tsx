import { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

const ChartCard = ({ title, children, className = "" }: ChartCardProps) => (
  <div className={`card-glass rounded-xl p-5 animate-fade-in ${className}`}>
    <h3 className="text-sm font-display font-semibold text-foreground mb-4">{title}</h3>
    {children}
  </div>
);

export default ChartCard;
