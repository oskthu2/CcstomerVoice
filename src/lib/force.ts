import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";

/** A box to lay out. x/y are the box centre. `fixed` boxes never move. */
export interface Box extends SimulationNodeDatum {
  id: string;
  w: number;
  h: number;
  fixed?: boolean;
  /** Pull towards this point (e.g. the group's anchor). */
  ax?: number;
  ay?: number;
  charge?: number;
}

export interface Link extends SimulationLinkDatum<Box> {
  source: string;
  target: string;
  distance: number;
  strength?: number;
}

/**
 * Rectangle collision: pushes overlapping boxes apart along the axis of least overlap.
 * d3's built-in forceCollide only knows circles, which wastes space around wide cards.
 */
function rectCollide(padding: number) {
  let nodes: Box[] = [];
  const force = (alpha: number) => {
    const strength = Math.min(1, 0.4 + alpha);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x! - a.x!;
        const dy = b.y! - a.y!;
        const ox = (a.w + b.w) / 2 + padding - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + padding - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const wa = a.fixed ? 0 : b.fixed ? 1 : 0.5;
        const wb = 1 - wa;
        if (a.fixed && b.fixed) continue;
        if (ox < oy) {
          const s = (dx < 0 ? -1 : 1) * ox * strength;
          a.x! -= s * wa;
          b.x! += s * wb;
        } else {
          const s = (dy < 0 ? -1 : 1) * oy * strength;
          a.y! -= s * wa;
          b.y! += s * wb;
        }
      }
    }
  };
  force.initialize = (n: Box[]) => {
    nodes = n;
  };
  return force;
}

/**
 * Runs a force simulation to completion (synchronously) and returns box centres.
 * Boxes keep their incoming x/y as a warm start, so re-layouts after new data move little.
 */
export function relax(boxes: Box[], links: Link[], opts: { ticks?: number; padding?: number } = {}) {
  for (const b of boxes) {
    if (b.fixed) {
      b.fx = b.x;
      b.fy = b.y;
    }
  }
  const sim = forceSimulation<Box>(boxes)
    .stop()
    .force(
      "link",
      forceLink<Box, Link>(links)
        .id((d) => d.id)
        .distance((l) => l.distance)
        .strength((l) => l.strength ?? 0.6),
    )
    .force("charge", forceManyBody<Box>().strength((d) => d.charge ?? -300).distanceMax(1400))
    .force("ax", forceX<Box>((d) => d.ax ?? d.x ?? 0).strength((d) => (d.ax === undefined ? 0 : 0.06)))
    .force("ay", forceY<Box>((d) => d.ay ?? d.y ?? 0).strength((d) => (d.ay === undefined ? 0 : 0.06)))
    .force("collide", rectCollide(opts.padding ?? 22));
  const ticks = opts.ticks ?? 320;
  for (let i = 0; i < ticks; i++) sim.tick();
  // A few collision-only passes so nothing is left overlapping when the sim cools down.
  const collide = rectCollide(opts.padding ?? 22);
  collide.initialize(boxes);
  for (let i = 0; i < 80; i++) collide(0.6);
  return new Map(boxes.map((b) => [b.id, { x: b.x!, y: b.y! }]));
}

/** Stable pseudo-random number in [0,1) from a string (deterministic jitter). */
export function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
