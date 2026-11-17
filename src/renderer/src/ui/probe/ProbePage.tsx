// The probe's React half (UI-ii Task 5): every sample as a <PixelText> 640 internal px right of its Pixi twin.
import { PixelText } from '../stage/PixelText';
import { Stage } from '../stage/Stage';
import { PROBE_SAMPLES } from './samples';

export function ProbePage() {
  return <Stage>{PROBE_SAMPLES.map((p, i) => <PixelText key={i} text={p.text} x={p.x + 640} y={p.y} size={p.size} tint={p.tint} anchorX={p.anchorX} anchorY={p.anchorY} />)}</Stage>;
}
