const logicalKey = { pattern: '^[a-z0-9][a-z0-9_.-]*$', type: 'string' } as const;
const localeCode = { pattern: '^[a-z]{2}_[a-z]{2}$', type: 'string' } as const;
const resourceLocation = {
  pattern: '^[a-z0-9_.-]+:[a-z0-9_./-]+$',
  type: 'string',
} as const;
const localizedText = {
  additionalProperties: { type: 'string' },
  minProperties: 1,
  patternProperties: { '^[a-z]{2}_[a-z]{2}$': { type: 'string' } },
  propertyNames: localeCode,
  type: 'object',
} as const;
const localizedLines = {
  additionalProperties: {
    items: { type: 'string' },
    type: 'array',
  },
  minProperties: 1,
  patternProperties: {
    '^[a-z]{2}_[a-z]{2}$': { items: { type: 'string' }, type: 'array' },
  },
  propertyNames: localeCode,
  type: 'object',
} as const;
const point = {
  additionalProperties: false,
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
  type: 'object',
} as const;
const taskBaseProperties = {
  key: logicalKey,
  optional: { type: 'boolean' },
  title: localizedText,
} as const;
const rewardBaseProperties = {
  autoClaim: { enum: ['default', 'disabled', 'enabled'], type: 'string' },
  key: logicalKey,
  title: localizedText,
} as const;

export const questSpecSchema = {
  $id: 'https://github.com/nbsp1221/questspec/schema/questspec-1.json',
  additionalProperties: false,
  properties: {
    chapters: {
      items: {
        additionalProperties: false,
        properties: {
          defaultHideDependencyLines: { type: 'boolean' },
          defaultQuestShape: { type: 'string' },
          filename: { pattern: '^[a-z0-9][a-z0-9_-]*$', type: 'string' },
          group: logicalKey,
          icon: resourceLocation,
          key: logicalKey,
          progressionMode: { enum: ['default', 'flexible', 'linear'], type: 'string' },
          quests: {
            items: {
              additionalProperties: false,
              properties: {
                dependencies: { items: logicalKey, type: 'array', uniqueItems: true },
                dependencyControlPoints: {
                  additionalProperties: { items: point, type: 'array' },
                  propertyNames: logicalKey,
                  type: 'object',
                },
                description: localizedLines,
                hideDependencyLines: { type: 'boolean' },
                hideUntilDependenciesVisible: { type: 'boolean' },
                key: logicalKey,
                optional: { type: 'boolean' },
                rewards: {
                  items: {
                    oneOf: [
                      {
                        additionalProperties: false,
                        properties: {
                          ...rewardBaseProperties,
                          type: { const: 'xp', type: 'string' },
                          xp: { maximum: 2_147_483_647, minimum: 1, type: 'integer' },
                        },
                        required: ['key', 'type', 'xp'],
                        type: 'object',
                      },
                    ],
                  },
                  type: 'array',
                },
                shape: { type: 'string' },
                size: { exclusiveMinimum: 0, type: 'number' },
                tasks: {
                  items: {
                    oneOf: [
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          consumeItems: { type: 'boolean' },
                          count: { minimum: 1, type: 'integer' },
                          item: resourceLocation,
                          matchComponents: {
                            enum: ['none', 'fuzzy', 'strict'],
                            type: 'string',
                          },
                          onlyFromCrafting: { type: 'boolean' },
                          taskScreenOnly: { type: 'boolean' },
                          type: { const: 'item', type: 'string' },
                        },
                        required: ['key', 'type', 'item'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          advancement: resourceLocation,
                          criterion: { type: 'string' },
                          type: { const: 'advancement', type: 'string' },
                        },
                        required: ['key', 'type', 'advancement'],
                        type: 'object',
                      },
                    ],
                  },
                  minItems: 1,
                  type: 'array',
                },
                title: localizedText,
                x: { type: 'number' },
                y: { type: 'number' },
              },
              required: ['key', 'title', 'x', 'y', 'tasks'],
              type: 'object',
            },
            type: 'array',
          },
          title: localizedText,
        },
        required: ['key', 'group', 'filename', 'title', 'icon', 'quests'],
        type: 'object',
      },
      type: 'array',
    },
    groups: {
      items: {
        additionalProperties: false,
        properties: { key: logicalKey, title: localizedText },
        required: ['key'],
        type: 'object',
      },
      type: 'array',
    },
    locales: {
      additionalProperties: false,
      properties: {
        default: localeCode,
        supported: { items: localeCode, minItems: 1, type: 'array', uniqueItems: true },
      },
      required: ['default', 'supported'],
      type: 'object',
    },
    questspec: { const: 1, type: 'integer' },
    settings: {
      additionalProperties: false,
      properties: {
        defaultAutoClaimRewards: { enum: ['disabled', 'enabled'], type: 'string' },
        defaultConsumeItems: { type: 'boolean' },
        defaultQuestDisableRecipeViewing: { type: 'boolean' },
        defaultQuestShape: { type: 'string' },
        defaultRewardTeam: { type: 'boolean' },
        detectionDelay: { minimum: 1, type: 'integer' },
        disableGui: { type: 'boolean' },
        dropLootCrates: { type: 'boolean' },
        emergencyItemsCooldown: { minimum: 0, type: 'integer' },
        gridScale: { exclusiveMinimum: 0, type: 'number' },
        icon: resourceLocation,
        lockMessage: { type: 'string' },
        pauseGame: { type: 'boolean' },
        progressionMode: { enum: ['default', 'flexible', 'linear'], type: 'string' },
        showLockIcons: { type: 'boolean' },
      },
      type: 'object',
    },
    target: {
      additionalProperties: false,
      properties: {
        dataVersion: { const: 13, type: 'integer' },
        loader: { const: 'neoforge@21.1.248', type: 'string' },
        minecraft: { const: '1.21.1', type: 'string' },
        questSystem: { const: 'ftbquests@2101.1.33', type: 'string' },
        serializer: { const: 'ftblibrary@2101.1.35', type: 'string' },
      },
      required: ['minecraft', 'loader', 'questSystem', 'serializer', 'dataVersion'],
      type: 'object',
    },
  },
  required: ['questspec', 'target', 'locales', 'groups', 'chapters'],
  type: 'object',
} as const;
