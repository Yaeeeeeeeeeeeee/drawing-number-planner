export type PackagingMode = 'ait' | 'manual' | 'none';
export type PackagingParameters = Record<string, string | number>;
export interface PackagingParameter {
  key: string; label: string; type: 'number' | 'text'; required: boolean; unit?: string;
  axis?: 'length' | 'width' | 'height';
}
export interface PackagingField { objectName: string; sourceKey: string; required: boolean }
export interface PackagingTemplateInput {
  name: string; mainCategoryId: number; projectItemId: number; brandIds: number[]; productIds: number[];
  fields: PackagingField[]; requiredFonts: string[]; status: 'active' | 'inactive';
}
export interface PackagingTemplate extends PackagingTemplateInput {
  id: number; fileName: string; assetRelativePath: string; sha256: string; revision: number;
  createdAt: string; updatedAt: string;
}
export interface DimensionProfileInput {
  name: string; projectItemId: number; scope: 'specific' | 'shared'; productIds: number[];
  parameters: PackagingParameters; isDefault: boolean; defaultProductIds?: number[]; ratioKeys?: [string,string]; ratio?: number;
  status: 'active' | 'inactive';
}
export interface DimensionProfile extends DimensionProfileInput { id: number; revision: number }
export interface TemplateCondition { key: string; operator: 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'eq'; value: string | number; max?: number }
export interface TemplateRuleInput {
  name: string; templateId: number; conditions: TemplateCondition[]; allowLengthWidthSwap: boolean;
  status: 'active' | 'inactive';
}
export interface TemplateRule extends TemplateRuleInput { id: number }
export interface PackagingProjectConfig {
  projectItemId: number; mode: PackagingMode; parameters: PackagingParameter[];
}
export interface PackagingCatalog {
  templates: PackagingTemplate[]; dimensions: DimensionProfile[]; rules: TemplateRule[]; configs: PackagingProjectConfig[];
}
export interface TemplateMatchContext {
  productId: number; brandId: number; mainCategoryId: number; projectItemId: number; parameters: PackagingParameters;
}
export interface PackagingMatch {
  status: 'unique' | 'multiple' | 'none' | 'missing_dimensions'; templateIds: number[]; missingParameters: string[];
}
export interface PackagingDrawingRef { origin: 'planned' | 'historical'; id: number; sourcePdfFileId?: number }
export interface PackagingTaskCreate {
  productId: number; name: string; type: 'new' | 'modify'; productDirectory?: string;
  drawings: PackagingDrawingRef[];
}
export interface PackagingTaskItemInput {
  templateId?: number; dimensionProfileId?: number; parameters?: PackagingParameters; mode?: PackagingMode; ratioLocked?: boolean;
}
export type PackagingItemState = 'pending' | 'generating' | 'generated' | 'failed' | 'awaiting_upload' | 'awaiting_review' | 'completed' | 'none';
export interface PackagingTaskItem extends PackagingTaskItemInput {
  id: number; taskId: string; drawing: PackagingDrawingRef; fullCode: string; projectItemId: number;
  projectName: string; color: string; mode: PackagingMode; parameters: PackagingParameters;
  state: PackagingItemState; match?: PackagingMatch; error?: string; reviewedSha256?: string;
  fileName?: string; relativePath?: string; sha256?: string; templateName?: string;
  originalRelativePath?: string; originalSha256?: string; backupRelativePath?: string;
}
export interface PackagingPendingFile {
  id: number; taskId: string; fileName: string; relativePath: string; sha256: string;
  status: 'pending' | 'linked'; reason: string; itemId?: number;
}
export interface PackagingTask {
  id: string; productId: number; model: string; name: string; type: 'new' | 'modify';
  state: 'active' | 'archiving' | 'awaiting_index' | 'completed'; productDirectory: string;
  taskDirectory: string; createdAt: string; completedAt?: string; error?: string;
  items: PackagingTaskItem[]; pendingFiles: PackagingPendingFile[];
}
export interface PackagingProductDirectory { productId: number; relativePath: string; exists: boolean }
export interface PackagingArchivePreview { taskId: string; ready: boolean; blockers: string[]; files: {itemId:number;fullCode:string;destination:string;replaces:boolean}[] }
