import { memo } from "react";
import { formatNumber } from "@/lib/colony";
import type { Construction } from "@/lib/colony-schema";
import { constructionPhaseIndex as phaseIndex } from "@/lib/selectors/presentation";

export const Meter = memo(function Meter({ value, max, warn = false, label }: {
  value: number;
  max: number;
  warn?: boolean;
  label: string;
}) {
  const safeValue = Math.max(0, Math.min(max, value));
  const percent = max > 0 ? safeValue / max * 100 : 0;
  return (
    <span className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max}
      aria-valuenow={Number(safeValue.toFixed(1))} aria-valuetext={`${formatNumber(safeValue, 1)} of ${formatNumber(max)}`}>
      <i className={warn ? "warn" : ""} style={{ width: `${percent}%` }} />
    </span>
  );
});

export const PhaseTracker = memo(function PhaseTracker({ project }: { project: Construction }) {
  const steps = ["Queued", "Foundation", "Structure", "Finish"];
  const current = phaseIndex(project);
  return (
    <ol className="phase-steps" aria-label={`Current phase: ${steps[current]}`}>
      {steps.map((step, index) => (
        <li key={step} className={index < current ? "done" : index === current ? "current" : ""}
          aria-current={index === current ? "step" : undefined}>
          <i aria-hidden="true" /><span>{step}</span>
        </li>
      ))}
    </ol>
  );
});
