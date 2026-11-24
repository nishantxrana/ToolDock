/**
 * The Boards engine works on a normalized work item, so Azure DevOps and Jira
 * sources share one mapping screen and one writer.
 */

/** Link types the writer recreates, in one canonical direction each. */
export type LinkRel =
  | 'System.LinkTypes.Hierarchy-Reverse' // this item's parent
  | 'System.LinkTypes.Related'
  | 'System.LinkTypes.Dependency-Forward' // this item → its successor
  | 'System.LinkTypes.Duplicate-Forward'; // this item → its duplicate

export interface NormalizedItem {
  /** Source id (ADO id as text, or Jira key). */
  sourceKey: string;
  sourceUrl: string;
  type: string;
  title: string;
  state: string;
  /** Proposed / InProgress / Resolved / Completed / Removed, for state fallback. */
  stateCategory?: string;
  /** Plain field values keyed by source field key. */
  fields: Record<string, unknown>;
  /** Rich-text fields keyed by source field key. */
  html: Record<string, string>;
  /** Path segments below the project root. */
  areaPath?: string[];
  iterationPath?: string[];
  createdAt?: string;
  createdBy?: string;
  changedAt?: string;
  /** People fields (assigned to…) keyed by source field key: display name or email. */
  people: Record<string, PersonRef>;
  tags: string[];
  attachments: { name: string; url: string; size?: number }[];
  links: { rel: LinkRel; targetKey: string }[];
  /** Extra hyperlinks to keep (not attachments, not work items). */
  hyperlinks: string[];
  /** Links the writer can't recreate (commits, PRs, builds), for the report. */
  unsupportedLinks: number;
}

export interface PersonRef {
  displayName: string;
  /** Email / UPN when the source exposes it. */
  uniqueName?: string;
}

export interface SourceType {
  name: string;
  states: { name: string; category?: string }[];
}

export interface SourceField {
  key: string;
  name: string;
  /** string | integer | double | dateTime | boolean | html | identity | treePath | plainText */
  type: string;
}

export interface SourceNode {
  name: string;
  startDate?: string;
  finishDate?: string;
  children: SourceNode[];
}

/** What a reader hands to the shared mapping and writer steps. */
export interface SourceSnapshot {
  items: NormalizedItem[];
  types: SourceType[];
  fields: SourceField[];
  /** Area / iteration trees below the project root (Jira: sprints only). */
  areas: SourceNode[];
  iterations: SourceNode[];
  people: PersonRef[];
}

export const UNMAPPED = '__none__';
export const CREATE = '__create__';
export const APPEND = '__append__';

export interface BoardsMapping {
  types: Record<string, string>;
  /** Per source type: source state → target state. */
  states: Record<string, Record<string, string>>;
  /** Source field key → target field reference, APPEND (description table) or UNMAPPED (skip). */
  fields: Record<string, string>;
  /** Value maps for picklist-like fields (e.g. Jira priority → 1..4). */
  values: Record<string, Record<string, string>>;
  areaPrefix: string;
  iterationPrefix: string;
  users: { enabled: boolean; map: Record<string, string> };
  tag: string;
  hyperlinkBack: boolean;
  sourceIdField: string;
  keepCreated: boolean;
  titlePrefix: boolean;
}
