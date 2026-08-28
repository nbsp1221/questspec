import { createHash } from 'node:crypto';

export type PhysicalObjectKind = 'chapter' | 'group' | 'quest' | 'reward' | 'rewardTable' | 'task';

export interface PhysicalIdObject {
  key: string;
  kind: PhysicalObjectKind;
}

export type PhysicalIdMap = Record<string, string>;

export interface PhysicalIdAllocation {
  ids: PhysicalIdMap;
  salts: Record<string, number>;
}

export type PhysicalIdErrorCode = 'ID_INVALID_PHYSICAL' | 'ID_PHYSICAL_COLLISION';

export class PhysicalIdAllocationError extends Error {
  readonly code: PhysicalIdErrorCode;

  constructor(code: PhysicalIdErrorCode, message: string) {
    super(message);
    this.name = 'PhysicalIdAllocationError';
    this.code = code;
  }
}

const namespace = 'questspec/physical-id/v1';
const physicalIdPattern = /^[0-7][0-9A-F]{15}$/u;

export function physicalIdKey(object: PhysicalIdObject): string {
  return `${object.kind}:${object.key}`;
}

export function derivePhysicalId(kind: PhysicalObjectKind, key: string, salt = 0): string {
  const digest = createHash('sha256')
    .update([namespace, kind, key, String(salt)].join('\0'))
    .digest();
  const numeric = digest.readBigUInt64BE() & 0x7fff_ffff_ffff_ffffn;
  return numeric.toString(16).toUpperCase().padStart(16, '0');
}

export function isValidPhysicalId(value: string): boolean {
  return (
    physicalIdPattern.test(value) && value !== '0000000000000000' && value !== '0000000000000001'
  );
}

export function allocatePhysicalIds(
  objects: PhysicalIdObject[],
  imported: PhysicalIdMap = {},
): PhysicalIdAllocation {
  const ids = Object.fromEntries(
    Object.entries(imported).map(([key, value]) => [key, value.toUpperCase()]),
  );
  const ownerById = new Map<string, string>();

  for (const [key, id] of Object.entries(ids).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!isValidPhysicalId(id)) {
      throw new PhysicalIdAllocationError(
        'ID_INVALID_PHYSICAL',
        `Imported physical ID for ${key} is not an assignable positive signed-long hex ID: ${id}`,
      );
    }
    const owner = ownerById.get(id);
    if (owner !== undefined && owner !== key) {
      throw new PhysicalIdAllocationError(
        'ID_PHYSICAL_COLLISION',
        `Physical ID ${id} is assigned to both ${owner} and ${key}`,
      );
    }
    ownerById.set(id, key);
  }

  const salts: Record<string, number> = {};
  const sortedObjects = [...objects].sort((left, right) =>
    physicalIdKey(left).localeCompare(physicalIdKey(right)),
  );
  for (const object of sortedObjects) {
    const mapKey = physicalIdKey(object);
    if (ids[mapKey] !== undefined) {
      continue;
    }

    let salt = 0;
    let id = derivePhysicalId(object.kind, object.key, salt);
    while (!isValidPhysicalId(id) || ownerById.has(id)) {
      salt += 1;
      id = derivePhysicalId(object.kind, object.key, salt);
    }
    ids[mapKey] = id;
    salts[mapKey] = salt;
    ownerById.set(id, mapKey);
  }

  return { ids, salts };
}
