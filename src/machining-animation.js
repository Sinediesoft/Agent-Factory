// The wire enters at the rear edge of the 0.75 m blank and retraces the slit to park.
const wireEntryTravel = .67 - .75/2 - (-.20);
const wireSlotDepth = .58;
const wireTravel = progress => (wireEntryTravel + wireSlotDepth) *
  Math.max(0, Math.min(1, progress/.86, (1-progress)/.14));
export const wireSlotLength = progress => Math.min(wireSlotDepth,
  Math.max(0, wireTravel(Math.min(progress,.86)) - wireEntryTravel));

// The nominal gap is exaggerated for the scene. Motion stays on the ram's vertical axis.
const ramFeedFraction = .12;
export function edmDischarging(progress) {
  return progress >= ramFeedFraction && progress < 1-ramFeedFraction;
}

export function edmSurfaceProgress(progress) {
  return Math.max(0,Math.min(1,(progress-ramFeedFraction)/(1-2*ramFeedFraction)));
}

function ramOffset(progress, phase) {
  const feed = Math.min(1, progress/ramFeedFraction, (1-progress)/ramFeedFraction);
  const lift = edmDischarging(progress) ? .003 * Math.pow(Math.sin(phase*2),2) : 0;
  return -.530*feed+lift;
}

// All motion is derived from the simulation tick, so pause and seek reproduce the same frame.
export function machiningFrame(tick, span, type, status) {
  if (!span || status !== 'processing' || tick < span.start || tick >= span.end) {
    return { active: false, progress: 0, offset: [0, 0, 0], phase: 0, pulse: 0 };
  }
  const progress = (tick - span.start) / (span.end - span.start);
  const ease = Math.max(0, Math.min(1, progress * 12, (1 - progress) * 12));
  const phase = (tick - span.start) * Math.PI * 2 / 900;
  const wave = Math.sin(phase), cross = Math.cos(phase * .7);
  const offset = {
    CNC: [.14 * wave, -.095 - .045 * Math.sin(phase * 2), .04 * cross],
    GRIND: [.34 * wave, -.035, .08 * cross],
    WIRE: [0, 0, wireTravel(progress)],
    EDM: [0,ramOffset(progress,phase),0],
  }[type] || [0, 0, 0];
  return { active: true, progress, offset: (type === 'WIRE' || type === 'EDM') ? offset : offset.map(value => value * ease),
    phase, pulse: .55 + .45 * Math.sin(phase * 5) };
}

export function machiningCycle(spans, tick) {
  const index=spans.findIndex(span=>span.start<=tick&&tick<span.end);
  if(index<0)return null;
  let first=index,last=index;
  while(first>0&&spans[first-1].end===spans[first].start&&spans[first-1].piece===spans[first].piece)first--;
  while(last<spans.length-1&&spans[last].end===spans[last+1].start&&spans[last].piece===spans[last+1].piece)last++;
  return {start:spans[first].start,end:spans[last].end,span:spans[index]};
}
