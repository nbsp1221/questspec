export { defaultPhysicalIdMapPath, readPhysicalIdMap, serializePhysicalIdMap } from './id-map.ts';
export {
  type PhysicalIdAllocation,
  type PhysicalIdErrorCode,
  type PhysicalIdMap,
  type PhysicalIdObject,
  type PhysicalObjectKind,
  allocatePhysicalIds,
  derivePhysicalId,
  isValidPhysicalId,
  PhysicalIdAllocationError,
  physicalIdKey,
} from './physical-id.ts';
