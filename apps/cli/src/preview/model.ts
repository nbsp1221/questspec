import type {
  ItemStack,
  LoadQuestbookGraphState,
  Quest,
  QuestGraphSummary,
  Questbook,
  Reward,
  Task,
  TerminalReward,
} from '@questspec/core';
import {
  PREVIEW_SCHEMA_VERSION,
  type PreviewBounds,
  type PreviewChapter,
  type PreviewDependencyEdge,
  type PreviewDependencyReference,
  type PreviewGraphState,
  type PreviewItemStack,
  type PreviewKnownShape,
  type PreviewModelV1,
  type PreviewNotice,
  type PreviewQuest,
  type PreviewQuestGraphMetadata,
  type PreviewQuestGraphSummary,
  type PreviewReward,
  type PreviewRewardTable,
  type PreviewTask,
  type PreviewTerminalReward,
} from '@questspec/preview-contract';
import { questInstanceId } from './provenance.ts';

export const PREVIEW_LAYOUT_V1 = Object.freeze({
  coordinateScale: 64,
  defaultNodeSize: 1,
  fitPadding: 32,
  hitTargetMinimum: 44,
  maximumDiameter: 384,
  maximumZoom: 4,
  minimumDiameter: 24,
  minimumZoom: 0.1,
  nodeSizeScale: 48,
} as const);

const knownShapes = new Set<PreviewKnownShape>([
  'circle',
  'diamond',
  'gear',
  'hexagon',
  'octagon',
  'pentagon',
  'square',
]);

export interface PreviewModelProjection {
  readonly model: PreviewModelV1;
  readonly notices: readonly PreviewNotice[];
}

interface QuestRecord {
  readonly chapterIndex: number;
  readonly chapterKey: string;
  readonly instanceId: string;
  readonly quest: Quest;
  readonly questIndex: number;
}

interface DependencyProjection {
  readonly edgesByChapter: readonly PreviewDependencyEdge[][];
  readonly incomingByInstance: ReadonlyMap<string, string[]>;
  readonly outgoingByInstance: ReadonlyMap<string, string[]>;
  readonly referencesByChapter: readonly PreviewDependencyReference[][];
}

export function projectPreviewModel(
  questbook: Questbook,
  graphState: LoadQuestbookGraphState,
): PreviewModelProjection {
  const notices: PreviewNotice[] = [];
  const records = questRecords(questbook);
  const dependencies = projectDependencies(questbook, records);
  const graphMetadata = projectGraphMetadata(graphState);
  const bookDefaultShape = questbook.settings.defaultQuestShape ?? '';

  const chapters = questbook.chapters.map((chapter, chapterIndex): PreviewChapter => {
    const effectiveDefaultQuestShape = chapter.defaultQuestShape || bookDefaultShape || 'circle';
    const quests = chapter.quests.map((quest, questIndex) =>
      projectQuest(
        quest,
        chapterIndex,
        questIndex,
        effectiveDefaultQuestShape,
        chapter.defaultHideDependencyLines,
        dependencies,
        graphMetadata,
        notices,
      ),
    );
    const dependencyEdges = dependencies.edgesByChapter[chapterIndex];
    return {
      defaultHideDependencyLines: chapter.defaultHideDependencyLines,
      defaultQuestShape: chapter.defaultQuestShape,
      dependencyEdges,
      dependencyReferences: dependencies.referencesByChapter[chapterIndex],
      effectiveDefaultQuestShape,
      filename: chapter.filename,
      fitBounds: calculateFitBounds(quests, dependencyEdges),
      group: chapter.group,
      icon: cloneItem(chapter.icon),
      key: chapter.key,
      localKey: chapter.localKey,
      progressionMode: chapter.progressionMode,
      quests,
      subtitle: cloneLocalizedLines(chapter.subtitle),
      title: cloneLocalizedText(chapter.title),
    };
  });

  const model: PreviewModelV1 = {
    chapters,
    defaultLocale: questbook.defaultLocale,
    defaultQuestShape: bookDefaultShape,
    graph: projectGraphState(graphState),
    groups: questbook.groups.map((group) => ({
      key: group.key,
      title: cloneLocalizedText(group.title),
    })),
    layout: PREVIEW_LAYOUT_V1,
    locales: [...questbook.locales],
    rewardTables: questbook.rewardTables.map(projectRewardTable),
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    target: { ...questbook.target },
  };
  return deepFreeze({ model, notices });
}

function questRecords(questbook: Questbook): QuestRecord[] {
  return questbook.chapters.flatMap((chapter, chapterIndex) =>
    chapter.quests.map((quest, questIndex) => ({
      chapterIndex,
      chapterKey: chapter.key,
      instanceId: questInstanceId(chapterIndex, questIndex),
      quest,
      questIndex,
    })),
  );
}

function projectDependencies(
  questbook: Questbook,
  records: readonly QuestRecord[],
): DependencyProjection {
  const byKey = new Map<string, QuestRecord[]>();
  const incomingByInstance = new Map<string, string[]>();
  const outgoingByInstance = new Map<string, string[]>();
  for (const record of records) {
    const candidates = byKey.get(record.quest.key) ?? [];
    candidates.push(record);
    byKey.set(record.quest.key, candidates);
    incomingByInstance.set(record.instanceId, []);
    outgoingByInstance.set(record.instanceId, []);
  }

  const referencesByChapter = questbook.chapters.map(() => [] as PreviewDependencyReference[]);
  const edgesByChapter = questbook.chapters.map(() => [] as PreviewDependencyEdge[]);
  for (const target of records) {
    for (const [dependencyIndex, sourceLogicalKey] of target.quest.dependencies.entries()) {
      const candidates = byKey.get(sourceLogicalKey) ?? [];
      const source = candidates.length === 1 ? candidates[0] : undefined;
      const status =
        candidates.length === 0 ? 'missing' : candidates.length === 1 ? 'resolved' : 'ambiguous';
      const id = `${target.instanceId}/dependencies/${dependencyIndex}`;
      const points = target.quest.dependencyControlPoints[sourceLogicalKey];
      const controlPoints = cloneControlPoints(points, id);
      const hidden =
        target.quest.hideDependencyLines ??
        questbook.chapters[target.chapterIndex].defaultHideDependencyLines;
      const reference: PreviewDependencyReference = {
        controlPoints,
        declaringInstanceId: target.instanceId,
        dependencyIndex,
        hidden,
        id,
        sameChapter: source === undefined ? null : source.chapterIndex === target.chapterIndex,
        sourceChapterKey: source?.chapterKey ?? null,
        sourceInstanceId: source?.instanceId ?? null,
        sourceLogicalKey,
        status,
        targetChapterKey: target.chapterKey,
        targetInstanceId: target.instanceId,
        targetLogicalKey: target.quest.key,
      };
      referencesByChapter[target.chapterIndex].push(reference);
      incomingByInstance.get(target.instanceId)!.push(id);
      if (source !== undefined) {
        outgoingByInstance.get(source.instanceId)!.push(id);
        if (source.chapterIndex === target.chapterIndex) {
          edgesByChapter[target.chapterIndex].push({
            controlPoints,
            hidden,
            id,
            sourceInstanceId: source.instanceId,
            sourceLogicalKey,
            targetInstanceId: target.instanceId,
            targetLogicalKey: target.quest.key,
          });
        }
      }
    }
  }
  for (const edges of edgesByChapter) {
    edges.sort(compareEdges);
  }
  return { edgesByChapter, incomingByInstance, outgoingByInstance, referencesByChapter };
}

function cloneControlPoints(
  points: readonly { readonly x: number; readonly y: number }[] | undefined,
  referenceId: string,
):
  | readonly [
      { readonly x: number; readonly y: number },
      { readonly x: number; readonly y: number },
    ]
  | null {
  if (points === undefined || points.length === 0) {
    return null;
  }
  if (points.length !== 2) {
    throw new TypeError(`Dependency ${referenceId} must have exactly two control points`);
  }
  return [
    { x: points[0].x, y: points[0].y },
    { x: points[1].x, y: points[1].y },
  ];
}

function compareEdges(left: PreviewDependencyEdge, right: PreviewDependencyEdge): number {
  return (
    compareCodePoints(left.sourceLogicalKey, right.sourceLogicalKey) ||
    compareCodePoints(left.targetLogicalKey, right.targetLogicalKey) ||
    compareCodePoints(left.id, right.id)
  );
}

function projectQuest(
  quest: Quest,
  chapterIndex: number,
  questIndex: number,
  chapterDefaultShape: string,
  chapterDefaultHideDependencyLines: boolean,
  dependencies: DependencyProjection,
  graphMetadata: ReadonlyMap<string, PreviewQuestGraphMetadata>,
  notices: PreviewNotice[],
): PreviewQuest {
  const instanceId = questInstanceId(chapterIndex, questIndex);
  const effectiveShape = quest.shape || chapterDefaultShape;
  const renderShape = knownShapes.has(effectiveShape as PreviewKnownShape)
    ? (effectiveShape as PreviewKnownShape)
    : 'fallback';
  if (renderShape === 'fallback') {
    notices.push({
      code: 'PREVIEW_UNKNOWN_SHAPE',
      instanceId,
      message: `Shape ${effectiveShape} uses the generic browser preview fallback`,
      path: ['chapters', chapterIndex, 'quests', questIndex, 'shape'],
      severity: 'warning',
    });
  }

  const declaredSize = quest.size === 0 ? null : quest.size;
  const rawDiameter =
    (declaredSize ?? PREVIEW_LAYOUT_V1.defaultNodeSize) * PREVIEW_LAYOUT_V1.nodeSizeScale;
  const diameter = Math.min(
    PREVIEW_LAYOUT_V1.maximumDiameter,
    Math.max(PREVIEW_LAYOUT_V1.minimumDiameter, rawDiameter),
  );
  if (diameter !== rawDiameter) {
    notices.push({
      code: 'PREVIEW_NODE_SIZE_CLAMPED',
      instanceId,
      message: `Node diameter ${rawDiameter} was clamped to ${diameter} CSS pixels`,
      path: ['chapters', chapterIndex, 'quests', questIndex, 'size'],
      severity: 'warning',
    });
  }

  return {
    declaredShape: quest.shape,
    declaredSize,
    dependencyRequirement: quest.dependencyRequirement,
    description: cloneLocalizedLines(quest.description),
    effectiveShape,
    geometry: {
      center: {
        x: quest.x * PREVIEW_LAYOUT_V1.coordinateScale,
        y: quest.y * PREVIEW_LAYOUT_V1.coordinateScale,
      },
      diameter,
      hitTargetDiameter: Math.max(diameter, PREVIEW_LAYOUT_V1.hitTargetMinimum),
    },
    graph: graphMetadata.get(quest.key) ?? null,
    hideDependencyLines: quest.hideDependencyLines ?? chapterDefaultHideDependencyLines,
    hideUntilDependenciesVisible: quest.hideUntilDependenciesVisible ?? null,
    icon: quest.icon === undefined ? null : cloneItem(quest.icon),
    incomingDependencyIds: [...(dependencies.incomingByInstance.get(instanceId) ?? [])],
    instanceId,
    key: quest.key,
    localKey: quest.localKey,
    minWidth: quest.minWidth,
    optional: quest.optional,
    outgoingDependencyIds: [...(dependencies.outgoingByInstance.get(instanceId) ?? [])],
    renderShape,
    rewards: quest.rewards.map(projectReward),
    subtitle: cloneLocalizedText(quest.subtitle),
    tasks: quest.tasks.map(projectTask),
    title: cloneLocalizedText(quest.title),
    x: quest.x,
    y: quest.y,
  };
}

function projectTask(task: Task): PreviewTask {
  const common = {
    disableToast: task.disableToast,
    icon: task.icon === undefined ? null : cloneItem(task.icon),
    key: task.key,
    localKey: task.localKey,
    optional: task.optional,
    tags: [...task.tags],
    title: cloneLocalizedText(task.title),
  };
  switch (task.type) {
    case 'advancement':
      return {
        ...common,
        advancement: task.advancement,
        criterion: task.criterion,
        type: task.type,
      };
    case 'biome':
      return { ...common, biome: task.biome, type: task.type };
    case 'checkmark':
      return { ...common, type: task.type };
    case 'dimension':
      return { ...common, dimension: task.dimension, type: task.type };
    case 'item':
      return {
        ...common,
        consumeItems: task.consumeItems ?? null,
        count: task.count,
        item: cloneItem(task.item),
        matchComponents: task.matchComponents,
        onlyFromCrafting: task.onlyFromCrafting ?? null,
        taskScreenOnly: task.taskScreenOnly,
        type: task.type,
      };
    case 'kill':
      return {
        ...common,
        count: task.count,
        customName: task.customName ?? null,
        entity: task.entity,
        entityTag: task.entityTag ?? null,
        nbtFilter: task.nbtFilter ?? null,
        type: task.type,
      };
    case 'observation':
      return {
        ...common,
        observationType: task.observationType,
        target: task.target,
        timer: task.timer,
        type: task.type,
      };
    case 'stat':
      return { ...common, count: task.count, stat: task.stat, type: task.type };
    case 'structure':
      return { ...common, structure: task.structure, type: task.type };
  }
}

function projectRewardTable(table: Questbook['rewardTables'][number]): PreviewRewardTable {
  return {
    emptyWeight: table.emptyWeight,
    entries: table.entries.map((entry) => ({
      reward: projectReward(entry.reward),
      weight: entry.weight,
    })),
    filename: table.filename,
    hideTooltip: table.hideTooltip,
    icon: table.icon === undefined ? null : cloneItem(table.icon),
    key: table.key,
    localKey: table.localKey,
    lootCrate:
      table.lootCrate === undefined
        ? null
        : {
            color: table.lootCrate.color,
            drops: { ...table.lootCrate.drops },
            glow: table.lootCrate.glow,
            itemName: table.lootCrate.itemName ?? null,
            stringId: table.lootCrate.stringId,
          },
    lootSize: table.lootSize,
    lootTable: table.lootTable ?? null,
    tags: [...table.tags],
    title: cloneLocalizedText(table.title),
    useTitle: table.useTitle,
  };
}

function projectReward(reward: TerminalReward): PreviewTerminalReward;
function projectReward(reward: Reward): PreviewReward;
function projectReward(reward: Reward): PreviewReward {
  const common = {
    autoClaim: reward.autoClaim,
    disableRewardScreenBlur: reward.disableRewardScreenBlur,
    excludeFromClaimAll: reward.excludeFromClaimAll,
    icon: reward.icon === undefined ? null : cloneItem(reward.icon),
    ignoreRewardBlocking: reward.ignoreRewardBlocking,
    key: reward.key,
    localKey: reward.localKey,
    tags: [...reward.tags],
    teamReward: reward.teamReward,
    title: cloneLocalizedText(reward.title),
  };
  switch (reward.type) {
    case 'item':
      return {
        ...common,
        count: reward.count,
        item: cloneItem(reward.item),
        onlyOne: reward.onlyOne,
        randomBonus: reward.randomBonus,
        type: reward.type,
      };
    case 'choice':
    case 'loot':
    case 'random':
      return { ...common, table: reward.table, type: reward.type };
    case 'xp':
      return { ...common, type: reward.type, xp: reward.xp };
    case 'xp_levels':
      return { ...common, levels: reward.levels, type: reward.type };
  }
}

function projectGraphState(graphState: LoadQuestbookGraphState): PreviewGraphState {
  if (graphState.kind !== 'available') {
    return { availability: 'unavailable', summary: null };
  }
  return {
    availability: graphState.partial ? 'partial' : 'available',
    summary: cloneGraphSummary(graphState.summary),
  };
}

function projectGraphMetadata(
  graphState: LoadQuestbookGraphState,
): ReadonlyMap<string, PreviewQuestGraphMetadata> {
  if (graphState.kind !== 'available') {
    return new Map();
  }
  const cycleKeys = new Set(graphState.summary.cycleComponents.flat());
  const componentByKey = new Map<string, number>();
  graphState.summary.weakComponents.forEach((component, index) => {
    component.forEach((key) => componentByKey.set(key, index));
  });
  return new Map(
    graphState.graph.nodes.map((node) => [
      node.key,
      {
        cycle: cycleKeys.has(node.key),
        maxDepth: graphState.summary.maxDepthByQuest?.[node.key] ?? null,
        minDepth: graphState.summary.minDepthByQuest?.[node.key] ?? null,
        weakComponent: componentByKey.get(node.key) ?? 0,
      },
    ]),
  );
}

function cloneGraphSummary(summary: QuestGraphSummary): PreviewQuestGraphSummary {
  return {
    criticalPath: summary.criticalPath === null ? null : [...summary.criticalPath],
    cycleComponents: summary.cycleComponents.map((component) => [...component]),
    edgeCount: summary.edgeCount,
    isolated: [...summary.isolated],
    leaves: [...summary.leaves],
    maxDepthByQuest: cloneNumberRecord(summary.maxDepthByQuest),
    maximumDepth: summary.maximumDepth,
    minDepthByQuest: cloneNumberRecord(summary.minDepthByQuest),
    nodeCount: summary.nodeCount,
    roots: [...summary.roots],
    topologicalOrder: summary.topologicalOrder === null ? null : [...summary.topologicalOrder],
    weakComponents: summary.weakComponents.map((component) => [...component]),
  };
}

function cloneNumberRecord(value: Record<string, number> | null): Record<string, number> | null {
  return value === null ? null : sortedRecord(value);
}

function calculateFitBounds(
  quests: readonly PreviewQuest[],
  edges: readonly PreviewDependencyEdge[],
): PreviewBounds | null {
  if (quests.length === 0) {
    return null;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const quest of quests) {
    const radius = quest.geometry.diameter / 2;
    xs.push(quest.geometry.center.x - radius, quest.geometry.center.x + radius);
    ys.push(quest.geometry.center.y - radius, quest.geometry.center.y + radius);
  }
  for (const edge of edges) {
    for (const point of edge.controlPoints ?? []) {
      xs.push(point.x * PREVIEW_LAYOUT_V1.coordinateScale);
      ys.push(point.y * PREVIEW_LAYOUT_V1.coordinateScale);
    }
  }
  const minX = Math.min(...xs) - PREVIEW_LAYOUT_V1.fitPadding;
  const maxX = Math.max(...xs) + PREVIEW_LAYOUT_V1.fitPadding;
  const minY = Math.min(...ys) - PREVIEW_LAYOUT_V1.fitPadding;
  const maxY = Math.max(...ys) + PREVIEW_LAYOUT_V1.fitPadding;
  return { height: maxY - minY, maxX, maxY, minX, minY, width: maxX - minX };
}

function cloneItem(item: ItemStack): PreviewItemStack {
  return { components: sortedRecord(item.components), id: item.id };
}

function cloneLocalizedText(value: Record<string, string>): Record<string, string> {
  return sortedRecord(value);
}

function cloneLocalizedLines(value: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareCodePoints)
      .map((key) => [key, [...value[key]]]),
  );
}

function sortedRecord<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareCodePoints)
      .map((key) => [key, value[key]]),
  );
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
