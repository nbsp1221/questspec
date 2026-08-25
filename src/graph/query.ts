import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { QuestGraph } from './quest-graph.ts';
import { compareQuestKeys } from './order.ts';

/** The explicit direction of a structural quest query. */
export type QuestGraphDirection = 'dependencies' | 'dependents';

/** Options for a bounded, multi-source structural reachability query. */
export interface QuestReachabilityQuery {
  readonly direction: QuestGraphDirection;
  readonly from: readonly string[];
  /** An inclusive number of structural edges. Omit for an unbounded query. */
  readonly maxDepth?: number;
}

/** Options for one shortest structural path query. */
export interface QuestPathQuery {
  readonly direction: QuestGraphDirection;
  readonly from: string;
  readonly to: string;
}

/** A quest and its nearest-source edge distance in a reachability result. */
export interface QuestReachability {
  readonly distance: number;
  readonly key: string;
}

/** A domain-owned query result; diagnostics make invalid queries observable. */
export interface QuestGraphQueryResult<T> {
  readonly diagnostics: Diagnostic[];
  readonly result: T | null;
}

export const QUEST_GRAPH_QUERY_UNKNOWN_FROM = 'GRAPH_QUERY_UNKNOWN_FROM';
export const QUEST_GRAPH_QUERY_UNKNOWN_TO = 'GRAPH_QUERY_UNKNOWN_TO';
export const QUEST_GRAPH_QUERY_INVALID_DIRECTION = 'GRAPH_QUERY_INVALID_DIRECTION';
export const QUEST_GRAPH_QUERY_INVALID_DEPTH = 'GRAPH_QUERY_INVALID_DEPTH';

/** Return the direct prerequisites of one quest in canonical key order. */
export function queryDirectDependencies(
  graph: QuestGraph,
  key: string,
): QuestGraphQueryResult<string[]> {
  return directNeighborhood(graph, key, 'dependencies');
}

/** Return the direct dependents of one quest in canonical key order. */
export function queryDirectDependents(
  graph: QuestGraph,
  key: string,
): QuestGraphQueryResult<string[]> {
  return directNeighborhood(graph, key, 'dependents');
}

/**
 * Return all quests reached from any supplied start, including each start at
 * distance zero. The first visit wins because the queue is a breadth-first
 * queue and every neighbor list is canonicalized by the graph engine.
 */
export function queryReachability(
  graph: QuestGraph,
  query: QuestReachabilityQuery,
): QuestGraphQueryResult<QuestReachability[]> {
  const diagnostics = validateDirectionAndDepth(query.direction, query.maxDepth);
  const unknownStarts = [...new Set(query.from.filter((key) => !hasQuest(graph, key)))].sort(
    compareQuestKeys,
  );
  diagnostics.push(...unknownStarts.map((key) => unknownQuestDiagnostic('from', key)));
  if (diagnostics.length > 0) {
    return { diagnostics, result: null };
  }

  const distances = new Map<string, number>();
  const queue: string[] = [...new Set(query.from)].sort(compareQuestKeys);
  for (const key of queue) {
    distances.set(key, 0);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index];
    const distance = distances.get(key)!;
    if (query.maxDepth !== undefined && distance >= query.maxDepth) {
      continue;
    }
    const neighbors = neighborsInDirection(graph, key, query.direction);
    for (const neighbor of neighbors) {
      if (distances.has(neighbor)) {
        continue;
      }
      distances.set(neighbor, distance + 1);
      queue.push(neighbor);
    }
  }

  const result = [...distances.entries()]
    .map(([key, distance]) => ({ key, distance }))
    .sort((left, right) => left.distance - right.distance || compareQuestKeys(left.key, right.key));
  return { diagnostics: [], result };
}

/** Return one deterministic shortest structural path, or null when absent. */
export function queryShortestPath(
  graph: QuestGraph,
  query: QuestPathQuery,
): QuestGraphQueryResult<string[]> {
  const diagnostics = validateDirectionAndDepth(query.direction);
  if (!hasQuest(graph, query.from)) {
    diagnostics.push(unknownQuestDiagnostic('from', query.from));
  }
  if (!hasQuest(graph, query.to)) {
    diagnostics.push(unknownQuestDiagnostic('to', query.to));
  }
  if (diagnostics.length > 0) {
    return { diagnostics, result: null };
  }
  if (query.from === query.to) {
    return { diagnostics: [], result: [query.from] };
  }

  // A domain-owned BFS keeps equal-length path selection stable even if a
  // graph-engine release changes its own shortest-path tie breaking.
  const parent = new Map<string, string | null>([[query.from, null]]);
  const queue = [query.from];
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index];
    for (const neighbor of neighborsInDirection(graph, key, query.direction)) {
      if (parent.has(neighbor)) {
        continue;
      }
      parent.set(neighbor, key);
      queue.push(neighbor);
      if (neighbor === query.to) {
        return { diagnostics: [], result: reconstructPath(parent, query.to) };
      }
    }
  }
  return { diagnostics: [], result: null };
}

/** Alias using the concise domain noun for callers that already have a graph. */
export const directDependencies = queryDirectDependencies;
/** Alias using the concise domain noun for callers that already have a graph. */
export const directDependents = queryDirectDependents;
/** Alias using the concise domain noun for callers that already have a graph. */
export const reachability = queryReachability;
/** Alias using the concise domain noun for callers that already have a graph. */
export const shortestPath = queryShortestPath;

function directNeighborhood(
  graph: QuestGraph,
  key: string,
  direction: QuestGraphDirection,
): QuestGraphQueryResult<string[]> {
  if (!hasQuest(graph, key)) {
    return { diagnostics: [unknownQuestDiagnostic('from', key)], result: null };
  }
  return {
    diagnostics: [],
    result: neighborsInDirection(graph, key, direction),
  };
}

function neighborsInDirection(
  graph: QuestGraph,
  key: string,
  direction: QuestGraphDirection,
): string[] {
  return direction === 'dependencies'
    ? graph.engine.directDependencies(key)
    : graph.engine.directDependents(key);
}

function hasQuest(graph: QuestGraph, key: string): boolean {
  return graph.nodeByKey.has(key);
}

function validateDirectionAndDepth(direction: unknown, maxDepth?: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (direction !== 'dependencies' && direction !== 'dependents') {
    diagnostics.push({
      code: QUEST_GRAPH_QUERY_INVALID_DIRECTION,
      message: `Invalid graph query direction ${JSON.stringify(direction)}`,
      path: ['direction'],
      severity: 'error',
    });
  }
  if (
    maxDepth !== undefined &&
    (typeof maxDepth !== 'number' || !Number.isSafeInteger(maxDepth) || maxDepth < 0)
  ) {
    diagnostics.push({
      code: QUEST_GRAPH_QUERY_INVALID_DEPTH,
      message: 'Graph query maxDepth must be a non-negative safe integer',
      path: ['maxDepth'],
      severity: 'error',
    });
  }
  return diagnostics;
}

function unknownQuestDiagnostic(kind: 'from' | 'to', key: string): Diagnostic {
  const code = kind === 'from' ? QUEST_GRAPH_QUERY_UNKNOWN_FROM : QUEST_GRAPH_QUERY_UNKNOWN_TO;
  return {
    code,
    message: `Unknown ${kind} quest key ${JSON.stringify(key)}`,
    path: [kind, key],
    severity: 'error',
  };
}

function reconstructPath(parent: ReadonlyMap<string, string | null>, target: string): string[] {
  const path: string[] = [];
  let key: string | null = target;
  while (key !== null) {
    path.push(key);
    key = parent.get(key) ?? null;
  }
  path.reverse();
  return path;
}
