export const PREVIEW_SCHEMA_VERSION = 1 as const;

export type PreviewSchemaVersion = typeof PREVIEW_SCHEMA_VERSION;

export interface PreviewContractDescriptor {
  readonly schemaVersion: PreviewSchemaVersion;
}
