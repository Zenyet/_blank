/**
 * Microbenchmark for the custom Engine: pairwise vs Barnes–Hut charge.
 *
 * Run with:  npx tsx scripts/bench-sim.ts
 *
 * Measures ticks/sec on representative graph sizes. The engine also has
 * an `auto` mode that picks pairwise below ~300 nodes and BH above; this
 * script reports both so you can see the crossover and verify the choice.
 */
import { performance } from 'node:perf_hooks';
import { folderCentroid } from '../src/designs/Graph/folderHue';
import { Engine, type EngineLink } from '../src/designs/Graph/sim/engine';
import type { GraphNode } from '../src/types';

function makeGraph(
  nodeCount: number,
  groupCount: number,
  linkCount: number,
  seed = 42
): { nodes: GraphNode[]; links: EngineLink[]; groupIndex: Map<string, number> } {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  const groupIndex = new Map<string, number>();
  for (let i = 0; i < groupCount; i++) groupIndex.set(`g${i}`, i);

  const nodes: GraphNode[] = Array.from({ length: nodeCount }, (_, i) => {
    const parentId = `g${i % groupCount}`;
    const idx = groupIndex.get(parentId)!;
    const c = folderCentroid(idx, groupCount, 260);
    return {
      id: `n${i}`,
      parentId,
      name: `node ${i}`,
      url: `https://x/${i}`,
      group: parentId,
      color: '#000',
      letter: String.fromCharCode(65 + (i % 26)),
      visits: (i * 7) % 20,
      last: '—',
      x: c.x + (rand() - 0.5) * 20,
      y: c.y + (rand() - 0.5) * 20,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius: 11 + Math.min(13, Math.sqrt(i % 20) * 0.9),
      groupHue: 200,
    };
  });

  const links: EngineLink[] = [];
  for (let k = 0; k < linkCount; k++) {
    const a = Math.floor(rand() * nodeCount);
    let b = Math.floor(rand() * nodeCount);
    if (b === a) b = (b + 1) % nodeCount;
    links.push({ source: nodes[a]!, target: nodes[b]! });
  }

  return { nodes, links, groupIndex };
}

function cloneNodes(src: GraphNode[]): GraphNode[] {
  return src.map((n) => ({ ...n }));
}

type Mode = 'pairwise' | 'barnes-hut';

function run(
  mode: Mode,
  nodes: GraphNode[],
  links: EngineLink[],
  groupIndex: Map<string, number>,
  ticks: number
): number {
  const e = new Engine({ chargeMode: mode });
  e.setTopology(nodes, links, groupIndex);
  e.alpha(1);
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) e.tick();
  return performance.now() - t0;
}

const SCENARIOS = [
  { n: 50, g: 4, links: 60, ticks: 500 },
  { n: 100, g: 6, links: 140, ticks: 500 },
  { n: 200, g: 8, links: 320, ticks: 300 },
  { n: 500, g: 12, links: 800, ticks: 150 },
  { n: 1000, g: 20, links: 1800, ticks: 80 },
  { n: 1500, g: 25, links: 2500, ticks: 60 },
  { n: 2000, g: 30, links: 3500, ticks: 40 },
  { n: 3000, g: 40, links: 5000, ticks: 25 },
];

console.log(
  'N'.padStart(5),
  'G'.padStart(3),
  'L'.padStart(5),
  'ticks'.padStart(6),
  '|',
  'pair ms'.padStart(10),
  'bh ms'.padStart(10),
  'µs/tick pair'.padStart(14),
  'µs/tick bh'.padStart(12),
  'winner'.padStart(10)
);
console.log('─'.repeat(95));

for (const s of SCENARIOS) {
  const graph = makeGraph(s.n, s.g, s.links);

  // Warm-up both paths to avoid JIT penalties.
  run('pairwise', cloneNodes(graph.nodes), graph.links, graph.groupIndex, 20);
  run('barnes-hut', cloneNodes(graph.nodes), graph.links, graph.groupIndex, 20);

  let pMin = Infinity;
  let bMin = Infinity;
  for (let t = 0; t < 3; t++) {
    pMin = Math.min(pMin, run('pairwise', cloneNodes(graph.nodes), graph.links, graph.groupIndex, s.ticks));
    bMin = Math.min(bMin, run('barnes-hut', cloneNodes(graph.nodes), graph.links, graph.groupIndex, s.ticks));
  }

  const pPer = (pMin * 1000) / s.ticks;
  const bPer = (bMin * 1000) / s.ticks;
  const winner = pMin < bMin ? `pair ${(bMin / pMin).toFixed(2)}x` : `bh ${(pMin / bMin).toFixed(2)}x`;

  console.log(
    String(s.n).padStart(5),
    String(s.g).padStart(3),
    String(s.links).padStart(5),
    String(s.ticks).padStart(6),
    '|',
    pMin.toFixed(1).padStart(10),
    bMin.toFixed(1).padStart(10),
    pPer.toFixed(1).padStart(14),
    bPer.toFixed(1).padStart(12),
    winner.padStart(14)
  );
}
