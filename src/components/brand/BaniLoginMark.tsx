interface BaniLoginMarkProps {
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
}

/** White five-triangle Bani mark (login screen only). */
export const BaniLoginMark = ({ className, svgRef }: BaniLoginMarkProps) => (
  <svg
    ref={svgRef}
    viewBox="0 0 320 600"
    aria-hidden="true"
    className={className}
    fill="currentColor"
  >
    <path d="M0 0 L160 100 L0 200 Z" />
    <path d="M160 100 L320 200 L160 300 Z" />
    <path d="M0 200 L160 300 L0 400 Z" />
    <path d="M160 300 L320 400 L160 500 Z" />
    <path d="M0 400 L160 500 L0 600 Z" />
  </svg>
);

export default BaniLoginMark;
