/**
 * Public entry point for the graph physics simulation.
 *
 * We previously dispatched between d3-force and a handrolled engine based
 * on a URL flag. Once the custom engine grew its own Barnes–Hut charge
 * implementation and benchmarks confirmed it was faster than d3 across
 * this app's realistic node counts (N ≤ ~2000), we dropped d3 entirely.
 *
 * If you ever want to compare back-ends again, see git history around
 * `sim/useGraphSimD3.ts` for the last d3-backed implementation.
 */

export type { GraphSim, SimParams } from './sim/types';
export { useGraphSimCustom as useGraphSim } from './sim/useGraphSimCustom';
