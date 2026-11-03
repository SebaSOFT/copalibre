/** A single measured ratio: a labelled bar showing how much of a whole is done. */
export interface RatioBarProps {
  /** What the bar measures, for assistive technology. */
  readonly label: string;
  readonly value: number;
  readonly max: number;
  /** The figures beside the bar, such as "4 / 10 matches". */
  readonly valueLabel: string;
}

export function RatioBar({ label, value, max, valueLabel }: RatioBarProps): React.JSX.Element {
  const safeMax = max > 0 ? max : 1;
  const bounded = Math.min(Math.max(value, 0), safeMax);
  return (
    <div className="cl-ratio-bar">
      <progress
        aria-label={label}
        aria-valuetext={valueLabel}
        className="cl-ratio-bar__track"
        max={safeMax}
        value={bounded}
      />
      <span className="cl-ratio-bar__value">{valueLabel}</span>
    </div>
  );
}
