import type { PreviewChapter, PreviewQuest, PreviewSnapshotV1 } from '@questspec/preview-contract';

const layout = {
  coordinateScale: 64,
  defaultNodeSize: 1,
  fitPadding: 32,
  hitTargetMinimum: 44,
  maximumDiameter: 384,
  maximumZoom: 4,
  minimumDiameter: 24,
  minimumZoom: 0.1,
  nodeSizeScale: 48,
} as const;
const target = {
  dataVersion: 13,
  loader: 'neoforge@21.1.248',
  minecraft: '1.21.1',
  questSystem: 'ftbquests@2101.1.33',
  serializer: 'ftblibrary@2101.1.35',
} as const;
const taskBase = {
  disableToast: false,
  icon: null,
  optional: false,
  tags: [],
  title: { en_us: 'Task', ko_kr: '작업' },
} as const;
const rewardBase = {
  autoClaim: 'default',
  disableRewardScreenBlur: false,
  excludeFromClaimAll: false,
  icon: null,
  ignoreRewardBlocking: false,
  tags: [],
  teamReward: 'default',
  title: { en_us: 'Reward', ko_kr: '보상' },
} as const;

export function makeQuest(instanceId: string, key: string, x: number, y: number): PreviewQuest {
  return {
    declaredShape: 'circle',
    declaredSize: null,
    dependencyRequirement: 'all_completed',
    description: { en_us: [`Description for ${key}.`], ko_kr: [`${key} 설명입니다.`] },
    effectiveShape: 'circle',
    geometry: { center: { x: x * 64, y: y * 64 }, diameter: 48, hitTargetDiameter: 48 },
    graph: { cycle: false, maxDepth: 1, minDepth: 1, weakComponent: 0 },
    hideDependencyLines: false,
    hideUntilDependenciesVisible: null,
    icon: { components: { 'minecraft:damage': '1' }, id: 'minecraft:diamond_sword' },
    incomingDependencyIds: [],
    instanceId,
    key,
    localKey: key.split('.').at(-1) ?? key,
    minWidth: 0,
    optional: false,
    outgoingDependencyIds: [],
    renderShape: 'circle',
    rewards: [],
    subtitle: { en_us: `Subtitle ${key}` },
    tasks: [],
    title: { en_us: `Quest ${key}`, ko_kr: `퀘스트 ${key}` },
    x,
    y,
  };
}

export function makeSnapshot(overrides: Partial<PreviewSnapshotV1> = {}): PreviewSnapshotV1 {
  const first = {
    ...makeQuest('chapters/0/quests/0', 'foundations.start', 0, 0),
    outgoingDependencyIds: ['edge-straight', 'ref-cross-chapter'],
    tasks: [
      {
        ...taskBase,
        key: 'item',
        localKey: 'item',
        type: 'item',
        item: { id: 'minecraft:oak_log', components: {} },
        count: 4,
        consumeItems: true,
        matchComponents: 'strict',
        onlyFromCrafting: false,
        taskScreenOnly: false,
      },
      {
        ...taskBase,
        key: 'advance',
        localKey: 'advance',
        type: 'advancement',
        advancement: 'minecraft:story/root',
        criterion: 'root',
      },
      { ...taskBase, key: 'check', localKey: 'check', type: 'checkmark' },
      {
        ...taskBase,
        key: 'kill',
        localKey: 'kill',
        type: 'kill',
        count: 2,
        customName: null,
        entity: 'minecraft:zombie',
        entityTag: 'minecraft:undead',
        nbtFilter: null,
      },
      {
        ...taskBase,
        key: 'structure',
        localKey: 'structure',
        type: 'structure',
        structure: 'minecraft:village_plains',
      },
      {
        ...taskBase,
        key: 'stat',
        localKey: 'stat',
        type: 'stat',
        count: 5,
        stat: 'minecraft:jump',
      },
      { ...taskBase, key: 'biome', localKey: 'biome', type: 'biome', biome: 'minecraft:plains' },
      {
        ...taskBase,
        key: 'dimension',
        localKey: 'dimension',
        type: 'dimension',
        dimension: 'minecraft:overworld',
      },
      {
        ...taskBase,
        key: 'observe',
        localKey: 'observe',
        type: 'observation',
        observationType: 'block',
        target: 'minecraft:stone',
        timer: 20,
      },
    ],
    rewards: [
      { ...rewardBase, key: 'xp', localKey: 'xp', type: 'xp', xp: 10 },
      { ...rewardBase, key: 'levels', localKey: 'levels', type: 'xp_levels', levels: 2 },
      {
        ...rewardBase,
        key: 'item',
        localKey: 'item',
        type: 'item',
        count: 1,
        item: { id: 'minecraft:iron_ingot', components: {} },
        onlyOne: false,
        randomBonus: 0,
      },
      { ...rewardBase, key: 'random', localKey: 'random', type: 'random', table: 'common' },
      { ...rewardBase, key: 'loot', localKey: 'loot', type: 'loot', table: 'common' },
      { ...rewardBase, key: 'choice', localKey: 'choice', type: 'choice', table: 'common' },
    ],
  } as PreviewQuest;
  const second = {
    ...makeQuest('chapters/0/quests/1', 'foundations.duplicate', 2, 0),
    incomingDependencyIds: ['edge-straight'],
    outgoingDependencyIds: ['edge-cubic'],
    renderShape: 'square',
    effectiveShape: 'square',
    declaredShape: 'square',
  } as PreviewQuest;
  const duplicate = {
    ...makeQuest('chapters/0/quests/2', 'foundations.duplicate', 2, 2),
    incomingDependencyIds: ['edge-cubic'],
    renderShape: 'fallback',
    effectiveShape: 'modded_shape',
    declaredShape: 'modded_shape',
    title: { en_us: 'Duplicate instance' },
  } as PreviewQuest;
  const chapter: PreviewChapter = {
    defaultHideDependencyLines: false,
    defaultQuestShape: 'circle',
    dependencyEdges: [
      {
        controlPoints: null,
        hidden: false,
        id: 'edge-straight',
        sourceInstanceId: first.instanceId,
        sourceLogicalKey: first.key,
        targetInstanceId: second.instanceId,
        targetLogicalKey: second.key,
      },
      {
        controlPoints: [
          { x: 3, y: 0 },
          { x: 3, y: 2 },
        ],
        hidden: true,
        id: 'edge-cubic',
        sourceInstanceId: second.instanceId,
        sourceLogicalKey: second.key,
        targetInstanceId: duplicate.instanceId,
        targetLogicalKey: duplicate.key,
      },
    ],
    dependencyReferences: [
      {
        controlPoints: null,
        declaringInstanceId: second.instanceId,
        dependencyIndex: 0,
        hidden: false,
        id: 'ref-1',
        sameChapter: true,
        sourceChapterKey: 'foundations',
        sourceInstanceId: first.instanceId,
        sourceLogicalKey: first.key,
        status: 'resolved',
        targetChapterKey: 'foundations',
        targetInstanceId: second.instanceId,
        targetLogicalKey: second.key,
      },
      {
        controlPoints: [
          { x: 3, y: 0 },
          { x: 3, y: 2 },
        ],
        declaringInstanceId: duplicate.instanceId,
        dependencyIndex: 0,
        hidden: true,
        id: 'ref-2',
        sameChapter: true,
        sourceChapterKey: 'foundations',
        sourceInstanceId: second.instanceId,
        sourceLogicalKey: second.key,
        status: 'resolved',
        targetChapterKey: 'foundations',
        targetInstanceId: duplicate.instanceId,
        targetLogicalKey: duplicate.key,
      },
      {
        controlPoints: null,
        declaringInstanceId: first.instanceId,
        dependencyIndex: 1,
        hidden: false,
        id: 'ref-missing',
        sameChapter: null,
        sourceChapterKey: null,
        sourceInstanceId: null,
        sourceLogicalKey: 'elsewhere.missing',
        status: 'missing',
        targetChapterKey: 'foundations',
        targetInstanceId: first.instanceId,
        targetLogicalKey: first.key,
      },
    ],
    effectiveDefaultQuestShape: 'circle',
    filename: '01_foundations',
    fitBounds: { height: 176, maxX: 176, maxY: 176, minX: -48, minY: -48, width: 224 },
    group: 'industry',
    icon: { id: 'minecraft:iron_pickaxe', components: {} },
    key: 'foundations',
    localKey: 'foundations',
    progressionMode: 'default',
    quests: [first, second, duplicate],
    subtitle: { en_us: ['Start here'], ko_kr: ['여기서 시작'] },
    title: { en_us: 'Foundations', ko_kr: '기초' },
  };
  const remoteQuest = {
    ...makeQuest('chapters/1/quests/0', 'automation.remote', 0, 0),
    graph: { cycle: false, maxDepth: 2, minDepth: 2, weakComponent: 0 },
    incomingDependencyIds: ['ref-cross-chapter'],
    title: { en_us: 'Remote automation' },
  } as PreviewQuest;
  const remoteChapter: PreviewChapter = {
    ...chapter,
    dependencyEdges: [],
    dependencyReferences: [
      {
        controlPoints: null,
        declaringInstanceId: remoteQuest.instanceId,
        dependencyIndex: 0,
        hidden: false,
        id: 'ref-cross-chapter',
        sameChapter: false,
        sourceChapterKey: chapter.key,
        sourceInstanceId: first.instanceId,
        sourceLogicalKey: first.key,
        status: 'resolved',
        targetChapterKey: 'automation',
        targetInstanceId: remoteQuest.instanceId,
        targetLogicalKey: remoteQuest.key,
      },
    ],
    filename: '02_automation',
    fitBounds: remoteQuest.geometry
      ? { height: 48, maxX: 24, maxY: 24, minX: -24, minY: -24, width: 48 }
      : null,
    icon: { id: 'minecraft:redstone', components: {} },
    key: 'automation',
    localKey: 'automation',
    progressionMode: 'linear',
    quests: [remoteQuest],
    subtitle: { en_us: ['Cross-chapter systems'] },
    title: { en_us: 'Automation' },
  };
  const base: PreviewSnapshotV1 = {
    currentInput: { catalogState: 'current', sourceState: 'normalized', validationState: 'valid' },
    diagnostics: [],
    generation: 1,
    model: {
      chapters: [chapter, remoteChapter],
      defaultLocale: 'en_us',
      defaultQuestShape: 'circle',
      graph: {
        availability: 'partial',
        summary: {
          criticalPath: null,
          cycleComponents: [],
          edgeCount: 3,
          isolated: [],
          leaves: [duplicate.key, remoteQuest.key],
          maxDepthByQuest: null,
          maximumDepth: null,
          minDepthByQuest: null,
          nodeCount: 4,
          roots: [first.key],
          topologicalOrder: null,
          weakComponents: [[first.key, second.key, duplicate.key, remoteQuest.key]],
        },
      },
      groups: [{ key: 'industry', title: { en_us: 'Industry', ko_kr: '산업' } }],
      layout,
      locales: ['en_us', 'ko_kr'],
      rewardTables: [],
      schemaVersion: 1,
      target,
    },
    modelNotices: [
      {
        code: 'PREVIEW_SHAPE_FALLBACK',
        instanceId: duplicate.instanceId,
        message: 'Unknown shape uses a neutral browser fallback.',
        path: ['chapters', 0, 'quests', 2],
        severity: 'warning',
      },
    ],
    provenanceByInstanceId: {
      [first.instanceId]: {
        fieldSpans: {
          title: {
            start: { column: 5, line: 20, offset: 200 },
            end: { column: 25, line: 20, offset: 220 },
          },
        },
        path: ['chapters', 0, 'quests', 0],
        span: {
          start: { column: 3, line: 18, offset: 180 },
          end: { column: 3, line: 60, offset: 600 },
        },
      },
    },
    retainedModel: {
      graphPartial: true,
      sourceRevision: 1,
      state: 'current',
      wasSemanticallyValid: true,
    },
    schemaVersion: 1,
    sessionNotices: [],
  };
  return { ...base, ...overrides };
}

export function makeLargeSnapshot(nodeCount = 500, edgeCount = 1000): PreviewSnapshotV1 {
  const snapshot = makeSnapshot();
  const quests = Array.from({ length: nodeCount }, (_, index) =>
    makeQuest(`chapters/0/quests/${index}`, `scale.q${index}`, index % 25, Math.floor(index / 25)),
  );
  const edges = Array.from({ length: edgeCount }, (_, index) => {
    const source = quests[index % nodeCount];
    const target = quests[(index * 17 + 1) % nodeCount];
    return {
      controlPoints: null,
      hidden: false,
      id: `edge-${index}`,
      sourceInstanceId: source.instanceId,
      sourceLogicalKey: source.key,
      targetInstanceId: target.instanceId,
      targetLogicalKey: target.key,
    };
  });
  const chapter = {
    ...snapshot.model!.chapters[0],
    dependencyEdges: edges,
    dependencyReferences: [],
    fitBounds: { height: 1280, maxX: 1560, maxY: 1240, minX: -24, minY: -24, width: 1584 },
    quests,
  };
  return {
    ...snapshot,
    model: {
      ...snapshot.model!,
      chapters: [chapter],
      graph: {
        availability: 'available',
        summary: { ...snapshot.model!.graph.summary!, edgeCount, nodeCount },
      },
    },
  };
}
