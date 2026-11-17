import "./kit.css";

export interface QuickFilterOption<K extends string> { key: K; label: string; count?: number }

/** Segmented control. A segment's count shows as an amber badge. */
export function QuickFilter<K extends string>({ options, value, onChange, label }: { options: QuickFilterOption<K>[]; value: K; onChange: (k: K) => void; label?: string }) {
  return (
    <div className="kit kit-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
          {o.count != null && o.count > 0 && <span className="kit-badge">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Small segmented choice used inside filter panels. */
export function Segmented<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; label?: string }) {
  return <QuickFilter options={options} value={value} onChange={onChange} label={label} />;
}
