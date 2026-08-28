import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Questbook } from '../ir/questbook.ts';
import { compareQuestKeys, sortedQuestKeys } from './order.ts';
import { type QuestGraph, type QuestGraphEdge, buildQuestGraph } from './quest-graph.ts';

/** The deterministic structural facts derived from one quest graph. */
export interface QuestGraphSummary {
  readonly criticalPath: string[] | null;
  readonly cycleComponents: string[][];
  readonly edgeCount: number;
  readonly isolated: string[];
  readonly leaves: string[];
  readonly maxDepthByQuest: Record<string, number> | null;
  readonly maximumDepth: number | null;
  readonly minDepthByQuest: Record<string, number> | null;
  readonly nodeCount: number;
  readonly roots: string[];
  readonly topologicalOrder: string[] | null;
  readonly weakComponents: string[][];
}

/** The result used by callers that need both construction and analysis findings. */
export interface QuestGraphAnalysis {
  readonly diagnostics: Diagnostic[];
  readonly graph: QuestGraph | null;
  readonly partial: boolean;
  readonly summary: QuestGraphSummary | null;
}

interface DepthResult {
  readonly criticalPath: string[] | null;
  readonly diagnostics: Diagnostic[];
  readonly maxDepthByQuest: Record<string, number>;
  readonly maximumDepth: number;
  readonly minDepthByQuest: Record<string, number>;
}

/**
 * Build and analyze a Questbook in one operation.
 *
 * A duplicate quest key leaves construction ambiguous and therefore returns no
 * graph. Missing endpoints, on the other hand, produce a partial graph so
 * that the valid structural portion can still be inspected.
 */
export function analyzeQuestbook(questbook: Questbook): QuestGraphAnalysis {
  const built = buildQuestGraph(questbook);
  if (built.graph === null) {
    const diagnostics = [
      ...built.diagnostics,
      {
        code: 'GRAPH_IDENTITY_AMBIGUOUS',
        message: 'Quest graph construction is unavailable because quest keys are ambiguous',
        path: [],
        severity: 'error' as const,
      },
    ];
    return { diagnostics, graph: null, partial: false, summary: null };
  }

  const analyzed = summarizeQuestGraph(built.graph);
  const cycleKeys = new Set(analyzed.summary.cycleComponents.flat());
  const cycleDiagnostics = built.graph.nodes
    .filter((node) => cycleKeys.has(node.key))
    .map((node) => ({
      code: 'GRAPH_CYCLE',
      message: `Quest ${node.key} participates in a dependency cycle`,
      path: [...node.path, 'dependencies'],
      severity: 'error' as const,
    }));

  return {
    diagnostics: [...built.diagnostics, ...analyzed.diagnostics, ...cycleDiagnostics],
    graph: built.graph,
    partial: built.partial,
    summary: analyzed.summary,
  };
}

/**
 * Compute the complete structural summary for an already-built graph.
 *
 * The engine supplies stack-safe graph primitives. Depth and tie-breaking are
 * kept here because they are QuestSpec concepts rather than engine concepts.
 */
export function summarizeQuestGraph(graph: QuestGraph): {
  readonly diagnostics: Diagnostic[];
  readonly summary: QuestGraphSummary;
} {
  const nodeKeys = [...graph.engine.nodeKeys];
  const roots = graph.engine.sources();
  const leaves = graph.engine.sinks();
  const leafSet = new Set(leaves);
  const isolated = roots.filter((key) => leafSet.has(key));

  // Build the local adjacency index once. Apart from making self-loop
  // detection O(V + E), this keeps all domain dynamic programs linear and
  // avoids repeated edge scans for each node or component.
  const incoming = new Map<string, QuestGraphEdge[]>();
  const selfLoops = new Set<string>();
  const edgeByEndpoints = new Map<string, QuestGraphEdge>();
  for (const key of nodeKeys) {
    incoming.set(key, []);
  }
  for (const edge of graph.edges) {
    incoming.get(edge.target)!.push(edge);
    edgeByEndpoints.set(edgeKey(edge.source, edge.target), edge);
    if (edge.source === edge.target) {
      selfLoops.add(edge.source);
    }
  }

  const cycleComponents = graph.engine
    .stronglyConnectedComponents()
    .filter((component) => component.length > 1 || selfLoops.has(component[0]));
  const weakComponents = graph.engine.weakComponents();
  const topologicalOrder = graph.engine.topologicalOrder();

  if (topologicalOrder === null) {
    return {
      diagnostics: [],
      summary: {
        criticalPath: null,
        cycleComponents,
        edgeCount: graph.edges.length,
        isolated,
        leaves,
        maxDepthByQuest: null,
        maximumDepth: null,
        minDepthByQuest: null,
        nodeCount: nodeKeys.length,
        roots,
        topologicalOrder: null,
        weakComponents,
      },
    };
  }

  const depth = calculateDepth(graph, topologicalOrder, incoming, edgeByEndpoints);
  return {
    diagnostics: depth.diagnostics,
    summary: {
      criticalPath: depth.criticalPath,
      cycleComponents,
      edgeCount: graph.edges.length,
      isolated,
      leaves,
      maxDepthByQuest: depth.maxDepthByQuest,
      maximumDepth: depth.maximumDepth,
      minDepthByQuest: depth.minDepthByQuest,
      nodeCount: nodeKeys.length,
      roots,
      topologicalOrder,
      weakComponents,
    },
  };
}

function calculateDepth(
  graph: QuestGraph,
  topologicalOrder: string[],
  incoming: ReadonlyMap<string, readonly QuestGraphEdge[]>,
  edgeByEndpoints: ReadonlyMap<string, QuestGraphEdge>,
): DepthResult {
  const minDepthByQuest: Record<string, number> = {};
  const maxDepthByQuest: Record<string, number> = {};

  for (const key of topologicalOrder) {
    const incomingEdges = incoming.get(key)!;
    if (incomingEdges.length === 0) {
      minDepthByQuest[key] = 0;
      maxDepthByQuest[key] = 0;
      continue;
    }

    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const edge of incomingEdges) {
      minimum = Math.min(minimum, minDepthByQuest[edge.source] + 1);
      maximum = Math.max(maximum, maxDepthByQuest[edge.source] + 1);
    }
    minDepthByQuest[key] = minimum;
    maxDepthByQuest[key] = maximum;
  }

  let maximumDepth = 0;
  for (const depth of Object.values(maxDepthByQuest)) {
    maximumDepth = Math.max(maximumDepth, depth);
  }

  // Rank the chosen maximum-depth path ending at each vertex. Ranks are
  // assigned by (parent path rank, current key) for one depth layer, so an
  // equal-depth tie is decided by the complete sequence, not merely by its
  // final predecessor. Only predecessor pointers and integer ranks are kept;
  // candidate arrays are never materialized in the hot edge loop.
  const nodesByDepth = new Map<number, string[]>();
  for (const key of graph.engine.nodeKeys) {
    const depth = maxDepthByQuest[key];
    const nodes = nodesByDepth.get(depth);
    if (nodes === undefined) {
      nodesByDepth.set(depth, [key]);
    } else {
      nodes.push(key);
    }
  }

  const chosenParentByQuest = new Map<string, string | undefined>();
  const pathRankByQuest = new Map<string, number>();
  for (let depth = 0; depth <= maximumDepth; depth += 1) {
    const nodes = nodesByDepth.get(depth) ?? [];
    if (depth > 0) {
      for (const key of nodes) {
        let chosenParent: string | undefined;
        let chosenRank = Number.POSITIVE_INFINITY;
        for (const edge of incoming.get(key)!) {
          if (maxDepthByQuest[edge.source] !== depth - 1) {
            continue;
          }
          const parentRank = pathRankByQuest.get(edge.source)!;
          if (
            parentRank < chosenRank ||
            (parentRank === chosenRank &&
              (chosenParent === undefined || compareQuestKeys(edge.source, chosenParent) < 0))
          ) {
            chosenParent = edge.source;
            chosenRank = parentRank;
          }
        }
        chosenParentByQuest.set(key, chosenParent);
      }
    }

    // Parent ranks are contiguous within a depth layer. Buckets preserve the
    // lexicographic order of complete paths while keeping this pass linear.
    const bucketCount = depth === 0 ? 1 : (nodesByDepth.get(depth - 1)?.length ?? 0);
    const buckets: string[][] = Array.from({ length: bucketCount }, () => []);
    for (const key of nodes) {
      const parent = chosenParentByQuest.get(key);
      const parentRank = parent === undefined ? 0 : pathRankByQuest.get(parent)!;
      buckets[parentRank].push(key);
    }
    let rank = 0;
    for (const bucket of buckets) {
      for (const key of bucket) {
        pathRankByQuest.set(key, rank);
        rank += 1;
      }
    }
  }

  let criticalPath: string[] | null = null;
  const deepestNodes = nodesByDepth.get(maximumDepth) ?? [];
  if (deepestNodes.length > 0) {
    let criticalEnd = deepestNodes[0];
    for (const key of deepestNodes.slice(1)) {
      if (pathRankByQuest.get(key)! < pathRankByQuest.get(criticalEnd)!) {
        criticalEnd = key;
      }
    }

    criticalPath = [];
    let current: string | undefined = criticalEnd;
    while (current !== undefined) {
      criticalPath.push(current);
      current = chosenParentByQuest.get(current);
    }
    criticalPath.reverse();
  }

  const diagnostics: Diagnostic[] = [];
  if (maximumDepth >= 1_000 && criticalPath !== null) {
    const overLimitEdge = edgeByEndpoints.get(edgeKey(criticalPath[999], criticalPath[1_000]));
    if (overLimitEdge !== undefined) {
      diagnostics.push({
        code: 'GRAPH_DEPENDENCY_DEPTH_EXCEEDED',
        message: `Structural dependency depth ${maximumDepth} reaches the FTB Quests limit of 1,000 edges`,
        path: [...overLimitEdge.path],
        severity: 'error',
      });
    }
  }

  return {
    criticalPath,
    diagnostics,
    maxDepthByQuest: orderRecord(maxDepthByQuest, graph.engine.nodeKeys),
    maximumDepth,
    minDepthByQuest: orderRecord(minDepthByQuest, graph.engine.nodeKeys),
  };
}

function edgeKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

function orderRecord(
  values: Record<string, number>,
  nodeKeys: readonly string[],
): Record<string, number> {
  return Object.fromEntries(sortedQuestKeys(nodeKeys).map((key) => [key, values[key]]));
}
