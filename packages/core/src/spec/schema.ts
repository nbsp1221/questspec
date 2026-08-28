const logicalKey = { pattern: '^[a-z0-9][a-z0-9_.-]*$', type: 'string' } as const;
const localeCode = { pattern: '^[a-z]{2}_[a-z]{2}$', type: 'string' } as const;
const resourceLocation = {
  pattern: '^[a-z0-9_.-]+:[a-z0-9_./-]+$',
  type: 'string',
} as const;
const itemStack = {
  oneOf: [
    resourceLocation,
    {
      additionalProperties: false,
      properties: {
        components: {
          additionalProperties: {
            additionalProperties: false,
            properties: { snbt: { minLength: 1, type: 'string' } },
            required: ['snbt'],
            type: 'object',
          },
          propertyNames: resourceLocation,
          type: 'object',
        },
        id: resourceLocation,
      },
      required: ['id'],
      type: 'object',
    },
  ],
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
  disableToast: { type: 'boolean' },
  icon: itemStack,
  key: logicalKey,
  optional: { type: 'boolean' },
  tags: { items: resourceLocation, type: 'array', uniqueItems: true },
  title: localizedText,
} as const;
const rewardBaseProperties = {
  autoClaim: { enum: ['default', 'disabled', 'enabled'], type: 'string' },
  disableRewardScreenBlur: { type: 'boolean' },
  excludeFromClaimAll: { type: 'boolean' },
  icon: itemStack,
  ignoreRewardBlocking: { type: 'boolean' },
  key: logicalKey,
  tags: { items: resourceLocation, type: 'array', uniqueItems: true },
  teamReward: { enum: ['default', 'disabled', 'enabled'], type: 'string' },
  title: localizedText,
} as const;
const {
  excludeFromClaimAll: _exclude,
  ignoreRewardBlocking: _ignore,
  ...tableRewardBaseProperties
} = rewardBaseProperties;

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
          icon: itemStack,
          key: logicalKey,
          progressionMode: { enum: ['default', 'flexible', 'linear'], type: 'string' },
          subtitle: localizedLines,
          quests: {
            items: {
              additionalProperties: false,
              properties: {
                dependencies: { items: logicalKey, type: 'array', uniqueItems: true },
                dependencyControlPoints: {
                  additionalProperties: {
                    items: point,
                    maxItems: 2,
                    minItems: 2,
                    type: 'array',
                  },
                  propertyNames: logicalKey,
                  type: 'object',
                },
                dependencyRequirement: {
                  enum: ['all_completed', 'one_completed', 'all_started', 'one_started'],
                  type: 'string',
                },
                description: localizedLines,
                hideDependencyLines: { type: 'boolean' },
                hideUntilDependenciesVisible: { type: 'boolean' },
                icon: itemStack,
                key: logicalKey,
                minWidth: { maximum: 3000, minimum: 0, type: 'integer' },
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
                      ...(['random', 'loot', 'choice'] as const).map((type) => ({
                        additionalProperties: false,
                        properties: {
                          ...tableRewardBaseProperties,
                          table: logicalKey,
                          type: { const: type, type: 'string' },
                        },
                        required: ['key', 'type', 'table'],
                        type: 'object',
                      })),
                      {
                        additionalProperties: false,
                        properties: {
                          ...rewardBaseProperties,
                          count: { maximum: 8192, minimum: 1, type: 'integer' },
                          item: itemStack,
                          onlyOne: { type: 'boolean' },
                          randomBonus: { maximum: 8192, minimum: 0, type: 'integer' },
                          type: { const: 'item', type: 'string' },
                        },
                        required: ['key', 'type', 'item'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...rewardBaseProperties,
                          levels: { maximum: 2_147_483_647, minimum: 1, type: 'integer' },
                          type: { const: 'xp_levels', type: 'string' },
                        },
                        required: ['key', 'type', 'levels'],
                        type: 'object',
                      },
                    ],
                  },
                  type: 'array',
                },
                shape: { type: 'string' },
                size: { exclusiveMinimum: 0, type: 'number' },
                subtitle: localizedText,
                tasks: {
                  items: {
                    oneOf: [
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          consumeItems: { type: 'boolean' },
                          count: { minimum: 1, type: 'integer' },
                          item: itemStack,
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
                          type: { const: 'checkmark', type: 'string' },
                        },
                        required: ['key', 'type'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          count: { maximum: Number.MAX_SAFE_INTEGER, minimum: 1, type: 'integer' },
                          customName: { type: 'string' },
                          entity: resourceLocation,
                          entityTag: resourceLocation,
                          nbtFilter: {
                            additionalProperties: false,
                            properties: { snbt: { minLength: 1, type: 'string' } },
                            required: ['snbt'],
                            type: 'object',
                          },
                          type: { const: 'kill', type: 'string' },
                        },
                        required: ['key', 'type', 'entity', 'count'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          structure: resourceLocation,
                          type: { const: 'structure', type: 'string' },
                        },
                        required: ['key', 'type', 'structure'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          count: { maximum: 2_147_483_647, minimum: 1, type: 'integer' },
                          stat: resourceLocation,
                          type: { const: 'stat', type: 'string' },
                        },
                        required: ['key', 'type', 'stat', 'count'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          biome: {
                            pattern: '^#?[a-z0-9_.-]+:[a-z0-9_./-]+$',
                            type: 'string',
                          },
                          type: { const: 'biome', type: 'string' },
                        },
                        required: ['key', 'type', 'biome'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          dimension: resourceLocation,
                          type: { const: 'dimension', type: 'string' },
                        },
                        required: ['key', 'type', 'dimension'],
                        type: 'object',
                      },
                      {
                        additionalProperties: false,
                        properties: {
                          ...taskBaseProperties,
                          observationType: {
                            enum: [
                              'block',
                              'block_tag',
                              'block_state',
                              'block_entity',
                              'block_entity_type',
                              'entity_type',
                              'entity_type_tag',
                            ],
                            type: 'string',
                          },
                          target: { minLength: 1, type: 'string' },
                          timer: { minimum: 0, type: 'integer' },
                          type: { const: 'observation', type: 'string' },
                        },
                        required: ['key', 'type', 'observationType', 'target'],
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
    rewardTables: {
      items: {
        additionalProperties: false,
        properties: {
          emptyWeight: { minimum: 0, type: 'number' },
          entries: {
            items: {
              oneOf: [
                {
                  additionalProperties: false,
                  properties: {
                    ...rewardBaseProperties,
                    count: { maximum: 8192, minimum: 1, type: 'integer' },
                    item: itemStack,
                    onlyOne: { type: 'boolean' },
                    randomBonus: { maximum: 8192, minimum: 0, type: 'integer' },
                    type: { const: 'item', type: 'string' },
                    weight: { minimum: 0, type: 'number' },
                  },
                  required: ['key', 'type', 'item'],
                  type: 'object',
                },
                {
                  additionalProperties: false,
                  properties: {
                    ...rewardBaseProperties,
                    type: { const: 'xp', type: 'string' },
                    weight: { minimum: 0, type: 'number' },
                    xp: { maximum: 2_147_483_647, minimum: 1, type: 'integer' },
                  },
                  required: ['key', 'type', 'xp'],
                  type: 'object',
                },
                {
                  additionalProperties: false,
                  properties: {
                    ...rewardBaseProperties,
                    levels: { maximum: 2_147_483_647, minimum: 1, type: 'integer' },
                    type: { const: 'xp_levels', type: 'string' },
                    weight: { minimum: 0, type: 'number' },
                  },
                  required: ['key', 'type', 'levels'],
                  type: 'object',
                },
              ],
            },
            minItems: 1,
            type: 'array',
          },
          filename: { pattern: '^[a-z0-9][a-z0-9_-]*$', type: 'string' },
          hideTooltip: { type: 'boolean' },
          icon: itemStack,
          key: logicalKey,
          lootCrate: {
            additionalProperties: false,
            properties: {
              color: { maximum: 16777215, minimum: 0, type: 'integer' },
              drops: {
                additionalProperties: false,
                properties: {
                  boss: { maximum: 2_147_483_647, minimum: 0, type: 'integer' },
                  monster: { maximum: 2_147_483_647, minimum: 0, type: 'integer' },
                  passive: { maximum: 2_147_483_647, minimum: 0, type: 'integer' },
                },
                type: 'object',
              },
              glow: { type: 'boolean' },
              itemName: { type: 'string' },
              stringId: { minLength: 1, type: 'string' },
            },
            required: ['stringId'],
            type: 'object',
          },
          lootSize: { minimum: 1, type: 'integer' },
          lootTable: resourceLocation,
          tags: { items: resourceLocation, type: 'array', uniqueItems: true },
          title: localizedText,
          useTitle: { type: 'boolean' },
        },
        required: ['key', 'entries'],
        type: 'object',
      },
      type: 'array',
    },
    settings: {
      additionalProperties: false,
      properties: {
        defaultAutoClaimRewards: { enum: ['disabled', 'enabled'], type: 'string' },
        defaultConsumeItems: { type: 'boolean' },
        defaultQuestDisableRecipeViewing: { type: 'boolean' },
        defaultQuestShape: { type: 'string' },
        defaultRewardTeam: { type: 'boolean' },
        detectionDelay: { maximum: 200, minimum: 0, type: 'integer' },
        disableGui: { type: 'boolean' },
        dropLootCrates: { type: 'boolean' },
        emergencyItemsCooldown: { maximum: 2_147_483_647, minimum: 0, type: 'integer' },
        gridScale: { exclusiveMinimum: 0, type: 'number' },
        icon: itemStack,
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
