import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from "recharts";

interface Props {
  data: { v: number }[];
  fill?: boolean;
  height?: number;
  color?: string;
  dotLast?: boolean;
}

export function Sparkline({ data, fill = false, height = 40, color = "hsl(var(--primary))", dotLast = false }: Props) {
  if (!data.length) return <div style={{ height }} />;
  const last = data.length - 1;
  if (fill) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="spkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#spkFill)"
            dot={dotLast ? (props: any) => (props.index === last ? <circle cx={props.cx} cy={props.cy} r={3} fill={color} /> : <g />) : false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
