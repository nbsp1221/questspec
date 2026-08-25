import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Quest, Questbook } from '../ir/questbook.ts';
import { type QuestGraphEngine, createQuestGraphEngine } from './engine.ts';
import { compareQuestKeys, sortedQuestKeys } from './order.ts';

export type QuestPath = Array<number | string>;

/** Immutable provenance for a canonical quest vertex. */
export interface QuestGraphNode {
  readonly chapterIndex: number;
  readonly chapterKey: string;
  readonly key: string;
  readonly path: QuestPath;
  readonly questIndex: number;
}

/** Immutable provenance for a canonical prerequisite-to-dependent edge. */
export interface QuestGraphEdge {
  readonly dependencyIndex: number;
  readonly id: string;
  readonly path: QuestPath;
  readonly source: string;
  readonly target: string;
}

/** The derived graph view; no Questbook object is retained in this value. */
export interface QuestGraph {
  readonly edges: readonly QuestGraphEdge[];
  readonly engine: QuestGraphEngine;
  readonly nodes: readonly QuestGraphNode[];
  readonly nodeByKey: ReadonlyMap<string, QuestGraphNode>;
}

export interface BuildQuestGraphResult {
  readonly diagnostics: Diagnostic[];
  readonly graph: QuestGraph | null;
  readonly partial: boolean;
}

interface QuestRecord {
  readonly chapterIndex: number;
  readonly chapterKey: string;
  readonly quest: Quest;
  readonly questIndex: number;
}

/**
 * Derive the structural graph from a Questbook.
 *
 * All quest objects are read only while constructing primitive node/edge
 * records. Invalid dependency endpoints are omitted after their diagnostics
 * are recorded; duplicate quest identities make the graph unavailable because
 * endpoint identity is ambiguous.
 */
export function buildQuestGraph(questbook: Questbook): BuildQuestGraphResult {
  const records = questRecords(questbook);
  const recordByKey = new Map<string, QuestRecord>();
  const duplicateKeys = new Set<string>();

  for (const record of records) {
    if (recordByKey.has(record.quest.key)) {
      duplicateKeys.add(record.quest.key);
    } else {
      recordByKey.set(record.quest.key, record);
    }
  }

  const diagnostics: Diagnostic[] = [];
  const edges: QuestGraphEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const record of records) {
    // Canonicalize dependency traversal, while retaining each declaration's
    // original index for source diagnostics and provenance.
    const dependencies = sortedQuestKeys(record.quest.dependencies);
    for (const dependency of dependencies) {
      const dependencyIndex = record.quest.dependencies.indexOf(dependency);
      const path: QuestPath = [
        'chapters',
        record.chapterIndex,
        'quests',
        record.questIndex,
        'dependencies',
        dependencyIndex,
      ];
      if (!recordByKey.has(dependency)) {
        diagnostics.push({
          code: 'GRAPH_MISSING_DEPENDENCY',
          message: `Quest ${record.quest.key} depends on missing quest ${dependency}`,
          path,
          severity: 'error',
        });
        continue;
      }

      // QuestSpec's schema defines dependency arrays as sets. De-duplicating
      // malformed input here still prevents parallel edges from changing the
      // graph's structural meaning or creating duplicate engine IDs.
      const edgeKey = `${dependency}\u0000${record.quest.key}`;
      if (edgeKeys.has(edgeKey)) {
        continue;
      }
      edgeKeys.add(edgeKey);
      edges.push({
        dependencyIndex,
        id: edgeKey,
        path,
        source: dependency,
        target: record.quest.key,
      });
    }

    // Control points describe the rendering route for a declared dependency;
    // they never create a graph edge. An undeclared control point remains a
    // validation diagnostic at its own semantic source path.
    for (const dependency of sortedQuestKeys(Object.keys(record.quest.dependencyControlPoints))) {
      if (record.quest.dependencies.includes(dependency)) {
        continue;
      }
      diagnostics.push({
        code: 'GRAPH_CONTROL_POINT_WITHOUT_DEPENDENCY',
        message: `Dependency control points refer to undeclared dependency ${dependency}`,
        path: [
          'chapters',
          record.chapterIndex,
          'quests',
          record.questIndex,
          'dependencyControlPoints',
          dependency,
        ],
        severity: 'error',
      });
    }
  }

  const nodes = records
    .map((record) =>
      freezeNode({
        chapterIndex: record.chapterIndex,
        chapterKey: record.chapterKey,
        key: record.quest.key,
        path: ['chapters', record.chapterIndex, 'quests', record.questIndex],
        questIndex: record.questIndex,
      }),
    )
    .sort((left, right) => compareQuestKeys(left.key, right.key));

  const sortedEdges = edges
    .sort((left, right) => {
      const sourceDifference = compareQuestKeys(left.source, right.source);
      return sourceDifference === 0
        ? compareQuestKeys(left.target, right.target)
        : sourceDifference;
    })
    .map(freezeEdge);

  diagnostics.sort(compareDiagnostics);

  if (duplicateKeys.size > 0) {
    // Identity validation owns the IDENTITY_DUPLICATE diagnostic. Returning no
    // graph here prevents analysis from accidentally choosing one duplicate's
    // provenance while keeping this builder reusable by validation and CLI.
    return { diagnostics, graph: null, partial: false };
  }

  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const engine = createQuestGraphEngine(
    nodes.map((node) => node.key),
    sortedEdges.map(({ id, source, target }) => ({ id, source, target })),
  );

  const graph: QuestGraph = {
    edges: Object.freeze(sortedEdges),
    engine,
    nodes: Object.freeze(nodes),
    nodeByKey,
  };

  return {
    diagnostics,
    graph: Object.freeze(graph),
    partial: diagnostics.some((diagnostic) => diagnostic.code === 'GRAPH_MISSING_DEPENDENCY'),
  };
}

function questRecords(questbook: Questbook): QuestRecord[] {
  return questbook.chapters.flatMap((chapter, chapterIndex) =>
    chapter.quests.map((quest, questIndex) => ({
      chapterIndex,
      chapterKey: chapter.key,
      quest,
      questIndex,
    })),
  );
}

function freezeNode(node: QuestGraphNode): QuestGraphNode {
  return Object.freeze({ ...node, path: Object.freeze([...node.path]) as QuestPath });
}

function freezeEdge(edge: QuestGraphEdge): QuestGraphEdge {
  return Object.freeze({ ...edge, path: Object.freeze([...edge.path]) as QuestPath });
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const codeDifference = compareQuestKeys(left.code, right.code);
  if (codeDifference !== 0) {
    return codeDifference;
  }
  const messageDifference = compareQuestKeys(left.message, right.message);
  if (messageDifference !== 0) {
    return messageDifference;
  }
  return comparePath(left.path, right.path);
}

function comparePath(left: QuestPath, right: QuestPath): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
      continue;
    }
    const difference = compareQuestKeys(String(leftValue), String(rightValue));
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}
