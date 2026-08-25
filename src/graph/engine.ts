import {
  createGraph,
  getConnectedComponents,
  getGraphIssues,
  getPredecessors,
  getReversedGraph,
  getShortestPath,
  getSinks,
  getSources,
  getStronglyConnectedComponents,
  getSuccessors,
  getTopologicalSort,
} from '@statelyai/graph';
import { compareQuestKeys } from './order.ts';

/** The direction in which a structural quest graph is traversed. */
export type EngineDirection = 'dependencies' | 'dependents';

/** A plain, domain-owned edge description accepted by the engine boundary. */
export interface QuestGraphEngineEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

/**
 * The small engine port used by QuestSpec's graph domain code.
 *
 * No type from the selected graph implementation crosses this boundary. The
 * implementation intentionally returns fresh arrays so callers cannot mutate
 * the engine's canonical input through a result value.
 */
export interface QuestGraphEngine {
  readonly edgeCount: number;
  readonly nodeKeys: readonly string[];
  directDependencies(key: string): string[];
  directDependents(key: string): string[];
  sources(): string[];
  sinks(): string[];
  weakComponents(): string[][];
  stronglyConnectedComponents(): string[][];
  topologicalOrder(): string[] | null;
  shortestPath(from: string, to: string, direction: EngineDirection): string[] | null;
}

/** An internal, contextualized failure at the third-party engine boundary. */
export class QuestGraphEngineError extends Error {
  readonly operation: string;

  constructor(operation: string, details: string) {
    super(`Quest graph engine ${operation} failed: ${details}`);
    this.name = 'QuestGraphEngineError';
    this.operation = operation;
  }
}

type EngineNode = { readonly id: string };

/**
 * Build a QuestSpec-owned graph port from canonical node and edge data.
 *
 * The caller normally supplies already canonicalized data, but sorting again
 * here is cheap and makes this boundary deterministic when used directly.
 */
export function createQuestGraphEngine(
  nodeKeys: readonly string[],
  edges: readonly QuestGraphEngineEdge[],
): QuestGraphEngine {
  const canonicalNodes = [...nodeKeys].sort(compareQuestKeys);
  const canonicalEdges = [...edges].sort(compareEdges);

  const graph = runEngineOperation('construction', () =>
    createGraph({
      id: 'questspec-quest-graph',
      mode: 'directed',
      nodes: canonicalNodes.map((id) => ({ id })),
      edges: canonicalEdges.map((edge) => ({
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
      })),
    }),
  );

  const issues = runEngineOperation('construction validation', () => getGraphIssues(graph));
  if (issues.length > 0) {
    const codes = issues
      .map((issue) => issue.code)
      .sort(compareQuestKeys)
      .join(', ');
    throw new QuestGraphEngineError('construction validation', codes);
  }

  // The reverse graph is constructed once. Queries never expose it and it is
  // only used for prerequisite-direction shortest paths.
  const reversedGraph = runEngineOperation('reverse construction', () => getReversedGraph(graph));
  const frozenNodeKeys = Object.freeze([...canonicalNodes]);

  const sortNodes = (nodes: readonly EngineNode[]): string[] =>
    nodes.map((node) => node.id).sort(compareQuestKeys);

  const sortComponents = (components: readonly (readonly EngineNode[])[]): string[][] =>
    components.map((component) => sortNodes(component)).sort(compareComponentKeys);

  return {
    edgeCount: canonicalEdges.length,
    nodeKeys: frozenNodeKeys,

    directDependencies(key) {
      return runEngineOperation(`direct dependencies for ${JSON.stringify(key)}`, () =>
        sortNodes(getPredecessors(graph, key)),
      );
    },

    directDependents(key) {
      return runEngineOperation(`direct dependents for ${JSON.stringify(key)}`, () =>
        sortNodes(getSuccessors(graph, key)),
      );
    },

    sources() {
      return runEngineOperation('source query', () => sortNodes(getSources(graph)));
    },

    sinks() {
      return runEngineOperation('sink query', () => sortNodes(getSinks(graph)));
    },

    weakComponents() {
      return runEngineOperation('weak component query', () =>
        sortComponents(getConnectedComponents(graph)),
      );
    },

    stronglyConnectedComponents() {
      return runEngineOperation('strong component query', () =>
        sortComponents(getStronglyConnectedComponents(graph)),
      );
    },

    topologicalOrder() {
      return runEngineOperation('topological order', () => {
        const order = getTopologicalSort(graph);
        return order === null ? null : sortNodesInOrder(order);
      });
    },

    shortestPath(from, to, direction) {
      return runEngineOperation(
        `shortest path from ${JSON.stringify(from)} to ${JSON.stringify(to)} (${direction})`,
        () => {
          if (direction !== 'dependents' && direction !== 'dependencies') {
            throw new Error(`unsupported traversal direction ${JSON.stringify(direction)}`);
          }
          const selectedGraph = direction === 'dependents' ? graph : reversedGraph;
          const path = getShortestPath(selectedGraph, { from, to });
          if (path === undefined) {
            return null;
          }
          return [path.source.id, ...path.steps.map((step) => step.node.id)];
        },
      );
    },
  };
}

function compareEdges(left: QuestGraphEngineEdge, right: QuestGraphEngineEdge): number {
  const sourceDifference = compareQuestKeys(left.source, right.source);
  if (sourceDifference !== 0) {
    return sourceDifference;
  }
  const targetDifference = compareQuestKeys(left.target, right.target);
  if (targetDifference !== 0) {
    return targetDifference;
  }
  return compareQuestKeys(left.id, right.id);
}

function compareComponentKeys(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = compareQuestKeys(left[index], right[index]);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

function sortNodesInOrder(nodes: readonly EngineNode[]): string[] {
  // Kahn's ordering is stable for canonical graph input in 2.3.0. Preserve
  // that valid order; sorting the whole result would break edge precedence.
  return nodes.map((node) => node.id);
}

function runEngineOperation<T>(operation: string, callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    throw engineError(operation, error);
  }
}

function engineError(operation: string, error: unknown): QuestGraphEngineError {
  return new QuestGraphEngineError(
    operation,
    error instanceof Error ? error.message : String(error),
  );
}
