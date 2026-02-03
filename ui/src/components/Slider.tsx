interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
}

export function Slider({ label, value, onChange, min = 0, max = 100, leftLabel, rightLabel }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-gray-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
