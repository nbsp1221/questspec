import { describe, expect, it } from 'vitest';
import type { PhysicalIdAllocationError } from '../../packages/core/src/identity/physical-id.ts';
import {
  allocatePhysicalIds,
  derivePhysicalId,
} from '../../packages/core/src/identity/physical-id.ts';

describe('physical FTB IDs', () => {
  it('derives a stable positive signed-long ID from kind and logical identity', () => {
    expect(derivePhysicalId('quest', 'foundations.first_iron')).toBe('6C90DAFAF6D48B7F');
    expect(derivePhysicalId('task', 'foundations.first_iron')).toBe('4C568194DF0D3C5E');
    expect(derivePhysicalId('quest', 'foundations.first_iron')).toMatch(/^[0-7][0-9A-F]{15}$/u);
  });

  it('preserves valid imported IDs while allocating missing objects', () => {
    const result = allocatePhysicalIds(
      [
        { key: 'industry', kind: 'group' },
        { key: 'foundations', kind: 'chapter' },
      ],
      { 'group:industry': '2000000000000001' },
    );

    expect(result.ids).toMatchObject({
      'group:industry': '2000000000000001',
    });
    expect(result.ids['chapter:foundations']).toMatch(/^[0-7][0-9A-F]{15}$/u);
  });

  it('rejects imported IDs outside the positive signed-long range', () => {
    expect(() =>
      allocatePhysicalIds([{ key: 'industry', kind: 'group' }], {
        'group:industry': 'A000000000000001',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<PhysicalIdAllocationError>>({ code: 'ID_INVALID_PHYSICAL' }),
    );
  });

  it('rejects physical IDs reserved by FTB Quests', () => {
    for (const id of ['0000000000000000', '0000000000000001']) {
      expect(() =>
        allocatePhysicalIds([{ key: 'industry', kind: 'group' }], {
          'group:industry': id,
        }),
      ).toThrowError(
        expect.objectContaining<Partial<PhysicalIdAllocationError>>({
          code: 'ID_INVALID_PHYSICAL',
        }),
      );
    }
  });

  it('rejects imported physical ID collisions', () => {
    expect(() =>
      allocatePhysicalIds(
        [
          { key: 'industry', kind: 'group' },
          { key: 'foundations', kind: 'chapter' },
        ],
        {
          'chapter:foundations': '2000000000000001',
          'group:industry': '2000000000000001',
        },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<PhysicalIdAllocationError>>({
        code: 'ID_PHYSICAL_COLLISION',
      }),
    );
  });
});
