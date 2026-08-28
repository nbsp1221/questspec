export const PREVIEW_SCHEMA_VERSION = 1 as const;

export type PreviewSchemaVersion = typeof PREVIEW_SCHEMA_VERSION;
export type PreviewPath = readonly (number | string)[];

export interface PreviewSourcePosition {
  readonly column: number;
  readonly line: number;
  readonly offset: number;
}

export interface PreviewSourceSpan {
  readonly end: PreviewSourcePosition;
  readonly start: PreviewSourcePosition;
}

export interface PreviewTargetProfile {
  readonly dataVersion: 13;
  readonly loader: 'neoforge@21.1.248';
  readonly minecraft: '1.21.1';
  readonly questSystem: 'ftbquests@2101.1.33';
  readonly serializer: 'ftblibrary@2101.1.35';
}

export type PreviewLocalizedText = Readonly<Record<string, string>>;
export type PreviewLocalizedLines = Readonly<Record<string, readonly string[]>>;

export interface PreviewLocalizedSelection<T> {
  readonly fallback: boolean;
  readonly requestedLocale: string;
  readonly source: 'default' | 'logical-key' | 'selected';
  readonly usedLocale: string | null;
  readonly value: T;
}

export interface PreviewItemStack {
  readonly components: Readonly<Record<string, string>>;
  readonly id: string;
}

interface PreviewQuestObjectIdentity {
  readonly key: string;
  readonly localKey: string;
}

interface PreviewTaskBase extends PreviewQuestObjectIdentity {
  readonly disableToast: boolean;
  readonly icon: PreviewItemStack | null;
  readonly optional: boolean;
  readonly tags: readonly string[];
  readonly title: PreviewLocalizedText;
}

export interface PreviewItemTask extends PreviewTaskBase {
  readonly consumeItems: boolean | null;
  readonly count: number;
  readonly item: PreviewItemStack;
  readonly matchComponents: 'fuzzy' | 'none' | 'strict';
  readonly onlyFromCrafting: boolean | null;
  readonly taskScreenOnly: boolean;
  readonly type: 'item';
}

export interface PreviewAdvancementTask extends PreviewTaskBase {
  readonly advancement: string;
  readonly criterion: string;
  readonly type: 'advancement';
}

export interface PreviewCheckmarkTask extends PreviewTaskBase {
  readonly type: 'checkmark';
}

export interface PreviewKillTask extends PreviewTaskBase {
  readonly count: number;
  readonly customName: string | null;
  readonly entity: string;
  readonly entityTag: string | null;
  readonly nbtFilter: string | null;
  readonly type: 'kill';
}

export interface PreviewStructureTask extends PreviewTaskBase {
  readonly structure: string;
  readonly type: 'structure';
}

export interface PreviewStatTask extends PreviewTaskBase {
  readonly count: number;
  readonly stat: string;
  readonly type: 'stat';
}

export interface PreviewBiomeTask extends PreviewTaskBase {
  readonly biome: string;
  readonly type: 'biome';
}

export interface PreviewDimensionTask extends PreviewTaskBase {
  readonly dimension: string;
  readonly type: 'dimension';
}

export type PreviewObservationType =
  | 'block'
  | 'block_entity'
  | 'block_entity_type'
  | 'block_state'
  | 'block_tag'
  | 'entity_type'
  | 'entity_type_tag';

export interface PreviewObservationTask extends PreviewTaskBase {
  readonly observationType: PreviewObservationType;
  readonly target: string;
  readonly timer: number;
  readonly type: 'observation';
}

export type PreviewTask =
  | PreviewAdvancementTask
  | PreviewBiomeTask
  | PreviewCheckmarkTask
  | PreviewDimensionTask
  | PreviewItemTask
  | PreviewKillTask
  | PreviewObservationTask
  | PreviewStatTask
  | PreviewStructureTask;

interface PreviewRewardBase extends PreviewQuestObjectIdentity {
  readonly autoClaim: 'default' | 'disabled' | 'enabled';
  readonly disableRewardScreenBlur: boolean;
  readonly excludeFromClaimAll: boolean;
  readonly icon: PreviewItemStack | null;
  readonly ignoreRewardBlocking: boolean;
  readonly tags: readonly string[];
  readonly teamReward: 'default' | 'disabled' | 'enabled';
  readonly title: PreviewLocalizedText;
}

export interface PreviewXpReward extends PreviewRewardBase {
  readonly type: 'xp';
  readonly xp: number;
}

export interface PreviewXpLevelsReward extends PreviewRewardBase {
  readonly levels: number;
  readonly type: 'xp_levels';
}

export interface PreviewItemReward extends PreviewRewardBase {
  readonly count: number;
  readonly item: PreviewItemStack;
  readonly onlyOne: boolean;
  readonly randomBonus: number;
  readonly type: 'item';
}

export interface PreviewTableReward extends PreviewRewardBase {
  readonly table: string;
  readonly type: 'choice' | 'loot' | 'random';
}

export type PreviewReward =
  | PreviewItemReward
  | PreviewTableReward
  | PreviewXpLevelsReward
  | PreviewXpReward;

export interface PreviewPoint {
  readonly x: number;
  readonly y: number;
}

export interface PreviewCanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface PreviewBounds {
  readonly height: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
}

export type PreviewTerminalReward = PreviewItemReward | PreviewXpLevelsReward | PreviewXpReward;

export interface PreviewWeightedReward {
  readonly reward: PreviewTerminalReward;
  readonly weight: number;
}

export interface PreviewLootCrate {
  readonly color: number;
  readonly drops: {
    readonly boss: number;
    readonly monster: number;
    readonly passive: number;
  };
  readonly glow: boolean;
  readonly itemName: string | null;
  readonly stringId: string;
}

export interface PreviewRewardTable extends PreviewQuestObjectIdentity {
  readonly emptyWeight: number;
  readonly entries: readonly PreviewWeightedReward[];
  readonly filename: string;
  readonly hideTooltip: boolean;
  readonly icon: PreviewItemStack | null;
  readonly lootCrate: PreviewLootCrate | null;
  readonly lootSize: number;
  readonly lootTable: string | null;
  readonly tags: readonly string[];
  readonly title: PreviewLocalizedText;
  readonly useTitle: boolean;
}

export interface PreviewLayoutContractV1 {
  readonly coordinateScale: 64;
  readonly defaultNodeSize: 1;
  readonly fitPadding: 32;
  readonly hitTargetMinimum: 44;
  readonly maximumDiameter: 384;
  readonly maximumZoom: 4;
  readonly minimumDiameter: 24;
  readonly minimumZoom: 0.1;
  readonly nodeSizeScale: 48;
}

export type PreviewKnownShape =
  | 'circle'
  | 'diamond'
  | 'gear'
  | 'hexagon'
  | 'octagon'
  | 'pentagon'
  | 'square';

export interface PreviewNodeGeometry {
  readonly center: PreviewCanvasPoint;
  readonly diameter: number;
  readonly hitTargetDiameter: number;
}

export type PreviewDependencyStatus = 'ambiguous' | 'missing' | 'resolved';

export interface PreviewDependencyReference {
  readonly controlPoints: readonly [PreviewPoint, PreviewPoint] | null;
  readonly declaringInstanceId: string;
  readonly dependencyIndex: number;
  readonly hidden: boolean;
  readonly id: string;
  readonly sameChapter: boolean | null;
  readonly sourceChapterKey: string | null;
  readonly sourceInstanceId: string | null;
  readonly sourceLogicalKey: string;
  readonly status: PreviewDependencyStatus;
  readonly targetChapterKey: string;
  readonly targetInstanceId: string;
  readonly targetLogicalKey: string;
}

export interface PreviewDependencyEdge {
  readonly controlPoints: readonly [PreviewPoint, PreviewPoint] | null;
  readonly hidden: boolean;
  readonly id: string;
  readonly sourceInstanceId: string;
  readonly sourceLogicalKey: string;
  readonly targetInstanceId: string;
  readonly targetLogicalKey: string;
}

export interface PreviewQuestGraphMetadata {
  readonly cycle: boolean;
  readonly maxDepth: number | null;
  readonly minDepth: number | null;
  readonly weakComponent: number;
}

export interface PreviewQuest extends PreviewQuestObjectIdentity {
  readonly declaredShape: string;
  readonly declaredSize: number | null;
  readonly dependencyRequirement: 'all_completed' | 'all_started' | 'one_completed' | 'one_started';
  readonly description: PreviewLocalizedLines;
  readonly effectiveShape: string;
  readonly geometry: PreviewNodeGeometry;
  readonly graph: PreviewQuestGraphMetadata | null;
  readonly hideDependencyLines: boolean;
  readonly hideUntilDependenciesVisible: boolean | null;
  readonly icon: PreviewItemStack | null;
  readonly incomingDependencyIds: readonly string[];
  readonly instanceId: string;
  readonly minWidth: number;
  readonly optional: boolean;
  readonly outgoingDependencyIds: readonly string[];
  readonly renderShape: PreviewKnownShape | 'fallback';
  readonly rewards: readonly PreviewReward[];
  readonly subtitle: PreviewLocalizedText;
  readonly tasks: readonly PreviewTask[];
  readonly title: PreviewLocalizedText;
  readonly x: number;
  readonly y: number;
}

export interface PreviewGroup {
  readonly key: string;
  readonly title: PreviewLocalizedText;
}

export interface PreviewChapter extends PreviewQuestObjectIdentity {
  readonly defaultHideDependencyLines: boolean;
  readonly defaultQuestShape: string;
  readonly effectiveDefaultQuestShape: string;
  readonly dependencyEdges: readonly PreviewDependencyEdge[];
  readonly dependencyReferences: readonly PreviewDependencyReference[];
  readonly filename: string;
  readonly fitBounds: PreviewBounds | null;
  readonly group: string;
  readonly icon: PreviewItemStack;
  readonly progressionMode: 'default' | 'flexible' | 'linear';
  readonly quests: readonly PreviewQuest[];
  readonly subtitle: PreviewLocalizedLines;
  readonly title: PreviewLocalizedText;
}

export interface PreviewQuestGraphSummary {
  readonly criticalPath: readonly string[] | null;
  readonly cycleComponents: readonly (readonly string[])[];
  readonly edgeCount: number;
  readonly isolated: readonly string[];
  readonly leaves: readonly string[];
  readonly maxDepthByQuest: Readonly<Record<string, number>> | null;
  readonly maximumDepth: number | null;
  readonly minDepthByQuest: Readonly<Record<string, number>> | null;
  readonly nodeCount: number;
  readonly roots: readonly string[];
  readonly topologicalOrder: readonly string[] | null;
  readonly weakComponents: readonly (readonly string[])[];
}

export type PreviewGraphState =
  | {
      readonly availability: 'available' | 'partial';
      readonly summary: PreviewQuestGraphSummary;
    }
  | {
      readonly availability: 'unavailable';
      readonly summary: null;
    };

export interface PreviewNotice {
  readonly code: string;
  readonly instanceId?: string;
  readonly message: string;
  readonly path: readonly (number | string)[];
  readonly severity: 'info' | 'warning';
}

export interface PreviewModelV1 {
  readonly chapters: readonly PreviewChapter[];
  readonly defaultLocale: string;
  readonly defaultQuestShape: string;
  readonly graph: PreviewGraphState;
  readonly groups: readonly PreviewGroup[];
  readonly layout: PreviewLayoutContractV1;
  readonly locales: readonly string[];
  readonly rewardTables: readonly PreviewRewardTable[];
  readonly schemaVersion: PreviewSchemaVersion;
  readonly target: PreviewTargetProfile;
}
