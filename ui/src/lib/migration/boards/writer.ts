import { toProxyUrl } from '@/lib/api/client';
import { AdoError } from '@/lib/api/errors';
import { downloadBlob } from '@/lib/api/migrate/http';
import {
  addComment,
  createNode,
  createWorkItem,
  getNodeTree,
  updateWorkItem,
  uploadAttachment,
  type ClassificationNode,
  type NodeGroup,
  type PatchOp,
  type WitField,
  type WitType,
} from '@/lib/api/migrate/wit';
import { adoLinks } from '@/lib/migration/links';
import type { ReportItem } from '@/lib/migration/report';
import type { AdoCredential, JiraCredential } from '@/store/migrationStore';
import { escapeHtml, imageUrls, replaceImageUrls } from './html';
import { buildCreatePatch, minimalPatch } from './mapping';
import type { BoardsMapping, NormalizedItem, SourceNode, SourceSnapshot } from './types';
import { UNMAPPED } from './types';

/** The slice of the run API the writer needs (see features/migrate/useMigrationRun). */
export interface WriterApi {
  phase: (
    label: string,
    tasks: {
      key: string;
      label: string;
      journal?: { kind: string; sourceId: string };
      run: (ctx: { signal: AbortSignal }) => Promise<{
        status: 'ok' | 'skipped' | 'warning' | 'failed';
        message?: string;
        targetId?: string;
      } | void>;
    }[],
    concurrency?: number,
  ) => Promise<void>;
  report: (items: ReportItem | ReportItem[]) => void;
  idMap: (kind: string) => Promise<Map<string, string>>;
  log: (label: string, message?: string) => void;
  signal: AbortSignal;
}

export interface WriterContext {
  source: { ado: AdoCredential } | { jira: JiraCredential };
  sourceArea: 'Boards' | 'Jira';
  target: AdoCredential & { project: { id: string; name: string } };
  snapshot: SourceSnapshot;
  mapping: BoardsMapping;
  targetTypes: WitType[];
  targetFields: WitField[];
  loadComments: (item: NormalizedItem) => Promise<{ author: string; date: string; html: string }[]>;
  copyComments: boolean;
  copyAttachments: boolean;
}

const BYPASS_HINT = /bypass/i;

/** Every path the items use, parents first, with iteration dates from the source tree. */
export function neededPaths(
  items: NormalizedItem[],
  pick: (i: NormalizedItem) => string[] | undefined,
  tree: SourceNode[],
) {
  const out = new Map<string, { segments: string[]; startDate?: string; finishDate?: string }>();
  const find = (segments: string[]) => {
    let level = tree;
    let node: SourceNode | undefined;
    for (const s of segments) {
      node = level.find((n) => n.name.toLowerCase() === s.toLowerCase());
      if (!node) return undefined;
      level = node.children;
    }
    return node;
  };
  for (const item of items) {
    const segs = pick(item) ?? [];
    for (let i = 1; i <= segs.length; i++) {
      const part = segs.slice(0, i);
      const key = part.join('\\').toLowerCase();
      if (!out.has(key)) {
        const n = find(part);
        out.set(key, { segments: part, startDate: n?.startDate, finishDate: n?.finishDate });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.segments.length - b.segments.length);
}

function hasNode(tree: ClassificationNode | undefined, segments: string[]): boolean {
  let node = tree;
  for (const s of segments) {
    node = node?.children?.find((c) => c.name.toLowerCase() === s.toLowerCase());
    if (!node) return false;
  }
  return true;
}

export async function writeWorkItems(api: WriterApi, ctx: WriterContext) {
  const { target, mapping: m, snapshot } = ctx;
  const tProject = target.project;
  const org = target.organization;
  const area = ctx.sourceArea;
  const items = snapshot.items.filter((i) => (m.types[i.type] ?? UNMAPPED) !== UNMAPPED);
  const skippedTypes = snapshot.items.length - items.length;
  if (skippedTypes > 0) {
    api.report({
      area,
      severity: 'warning',
      title: 'Some items left out',
      detail: `${skippedTypes} item${skippedTypes === 1 ? '' : 's'} had a type with no target type and weren't copied.`,
    });
  }

  // 1. Area and iteration paths.
  for (const group of ['Areas', 'Iterations'] as NodeGroup[]) {
    const prefix = group === 'Areas' ? m.areaPrefix : m.iterationPrefix;
    const prefixSegs = prefix
      .split('\\')
      .map((p) => p.trim())
      .filter(Boolean);
    const paths = neededPaths(
      items,
      (i) => (group === 'Areas' ? i.areaPath : i.iterationPath),
      group === 'Areas' ? snapshot.areas : snapshot.iterations,
    );
    const tree = await getNodeTree(target, tProject.name, group).catch(() => undefined);
    const all = [
      ...prefixSegs.map((_, i) => ({
        segments: prefixSegs.slice(0, i + 1),
        startDate: undefined,
        finishDate: undefined,
        isPrefix: true,
      })),
      ...paths.map((p) => ({ ...p, segments: [...prefixSegs, ...p.segments], isPrefix: false })),
    ];
    const missing = all.filter((p) => !hasNode(tree, p.segments));
    await api.phase(
      `Creating ${group === 'Areas' ? 'area' : 'iteration'} paths`,
      missing.map((p) => ({
        key: `${group}:${p.segments.join('\\')}`,
        label: `${group === 'Areas' ? 'Area' : 'Iteration'} ${p.segments.join(' \\ ')}`,
        journal: {
          kind: group === 'Areas' ? 'area' : 'iteration',
          sourceId: p.segments.join('\\').toLowerCase(),
        },
        run: async () => {
          try {
            const attrs =
              group === 'Iterations' && p.startDate && p.finishDate
                ? { startDate: p.startDate, finishDate: p.finishDate }
                : undefined;
            const node = await createNode(
              target,
              tProject.id,
              group,
              p.segments.slice(0, -1),
              p.segments[p.segments.length - 1]!,
              attrs,
            );
            return { status: 'ok' as const, targetId: String(node.id) };
          } catch (e) {
            if (e instanceof AdoError && e.kind === 'rejected' && /exist/i.test(e.message))
              return { status: 'skipped' as const, message: 'Already exists.' };
            throw e;
          }
        },
      })),
      1,
    );
  }
  if (m.iterationPrefix || snapshot.iterations.length) {
    api.report({
      area,
      severity: 'action',
      title: 'Add iterations to team settings',
      detail:
        "New iterations only show on a team's backlog once they're selected in the team's settings.",
      targetUrl: adoLinks.boardsSettings(org, tProject.name),
    });
  }

  // 2. Work items.
  const typeByName = new Map(ctx.targetTypes.map((t) => [t.name, t]));
  const targetFields = new Map(ctx.targetFields.map((f) => [f.referenceName, f]));
  const sourceFields = new Map(snapshot.fields.map((f) => [f.key, f]));
  let bypass = m.keepCreated;
  let bypassReported = false;
  const imageCache = new Map<string, Promise<string | null>>();
  let imageFailures = 0;
  let rejectedRetries = 0;
  let stateFailures = 0;

  /** Re-upload an image that lives in the source (others are left as links). */
  const reupload = (url: string): Promise<string | null> => {
    if (!imageCache.has(url)) {
      imageCache.set(
        url,
        (async () => {
          if (!toProxyUrl(url)) return null;
          try {
            const blob = await downloadBlob(ctx.source, url, api.signal);
            const name = decodeURIComponent(
              new URL(url).searchParams.get('fileName') ?? url.split('/').pop() ?? 'image.png',
            ).slice(0, 200);
            // Jira image links end in a bare id; give the file a name with an extension.
            const ext = blob.type.startsWith('image/')
              ? blob.type.slice(6).replace('jpeg', 'jpg')
              : 'png';
            const fileName = /\.[a-z0-9]{2,5}$/i.test(name) ? name : `image-${name}.${ext}`;
            const up = await uploadAttachment(target, tProject.id, fileName, blob);
            return up.url;
          } catch {
            imageFailures++;
            return null;
          }
        })(),
      );
    }
    return imageCache.get(url)!;
  };

  const rewriteImages = async (html: string) => {
    const urls = imageUrls(html);
    if (urls.length === 0) return html;
    const map = new Map<string, string>();
    for (const u of urls) {
      const to = await reupload(u);
      if (to) map.set(u, to);
    }
    return replaceImageUrls(html, map);
  };

  await api.phase(
    'Creating work items',
    items.map((item) => ({
      key: `wi:${item.sourceKey}`,
      label: `${item.type} ${item.sourceKey}: ${item.title}`.slice(0, 140),
      journal: { kind: 'workitem', sourceId: item.sourceKey },
      run: async () => {
        const typeName = m.types[item.type]!;
        const targetType = typeByName.get(typeName);
        if (!targetType)
          return {
            status: 'failed' as const,
            message: `Type "${typeName}" doesn't exist in the target.`,
          };
        const html: Record<string, string> = {};
        for (const [k, v] of Object.entries(item.html)) html[k] = await rewriteImages(v);

        const plan = (useBypass: boolean) =>
          buildCreatePatch(item, {
            targetProject: tProject.name,
            targetType,
            targetFields,
            sourceFields,
            mapping: m,
            bypassRules: useBypass,
            html,
          });

        // Read the flag once: another item may switch it off while this one is in flight.
        const tryBypass = bypass;
        let p = plan(tryBypass);
        let created;
        let warning: string | undefined;
        try {
          created = await createWorkItem(target, tProject.id, typeName, p.patch, {
            bypassRules: tryBypass,
            suppressNotifications: true,
          });
        } catch (e) {
          if (
            tryBypass &&
            e instanceof AdoError &&
            (e.kind === 'forbidden' || e.kind === 'unauthorized' || BYPASS_HINT.test(e.message))
          ) {
            // No "bypass rules" permission: carry on without it for the whole run.
            bypass = false;
            if (!bypassReported) {
              bypassReported = true;
              api.report({
                area,
                severity: 'warning',
                title: 'Original dates not kept',
                detail:
                  "The target token can't bypass work item rules, so items were created with today's date and moved to their state afterwards. The original dates are in each description.",
              });
            }
            p = plan(false);
            created = await createWorkItem(target, tProject.id, typeName, p.patch, {
              suppressNotifications: true,
            });
          } else if (e instanceof AdoError && e.kind === 'rejected') {
            // A value the target won't take (picklist, rule): retry with the core fields only.
            rejectedRetries++;
            warning = `Some fields were left out: ${e.message}`;
            created = await createWorkItem(target, tProject.id, typeName, minimalPatch(p), {
              bypassRules: tryBypass,
              suppressNotifications: true,
            });
          } else throw e;
        }

        if (p.stateAfter) {
          try {
            await updateWorkItem(
              target,
              created.id,
              [{ op: 'add', path: '/fields/System.State', value: p.stateAfter }],
              { suppressNotifications: true },
            );
          } catch {
            stateFailures++;
            warning = `Left in its first state; couldn't move it to "${p.stateAfter}".`;
          }
        }
        return {
          status: warning ? ('warning' as const) : ('ok' as const),
          message: warning,
          targetId: String(created.id),
        };
      },
    })),
  );

  const ids = await api.idMap('workitem');

  // 3. Attachments and comments.
  if (ctx.copyAttachments || ctx.copyComments) {
    let commentFailures = 0;
    let attachmentFailures = 0;
    await api.phase(
      'Copying attachments and comments',
      items
        .filter(
          (i) =>
            ids.has(i.sourceKey) &&
            ((ctx.copyAttachments && i.attachments.length) || ctx.copyComments),
        )
        .map((item) => ({
          key: `extras:${item.sourceKey}`,
          label: `${item.sourceKey}: attachments and comments`,
          journal: { kind: 'extras', sourceId: item.sourceKey },
          run: async () => {
            const id = Number(ids.get(item.sourceKey));
            const notes: string[] = [];
            if (ctx.copyAttachments && item.attachments.length) {
              const rels: PatchOp[] = [];
              for (const a of item.attachments) {
                try {
                  if (a.size && a.size > 130 * 1024 * 1024) throw new Error('over 130 MB');
                  const blob = await downloadBlob(ctx.source, a.url, api.signal);
                  const up = await uploadAttachment(target, tProject.id, a.name, blob);
                  rels.push({
                    op: 'add',
                    path: '/relations/-',
                    value: {
                      rel: 'AttachedFile',
                      url: up.url,
                      attributes: { comment: 'Migrated' },
                    },
                  });
                } catch (e) {
                  attachmentFailures++;
                  notes.push(
                    `attachment "${a.name}" not copied (${e instanceof Error ? e.message : 'error'})`,
                  );
                }
              }
              if (rels.length)
                await updateWorkItem(target, id, rels, { suppressNotifications: true });
            }
            if (ctx.copyComments) {
              const comments = await ctx.loadComments(item);
              for (const c of comments) {
                try {
                  const body = await rewriteImages(c.html);
                  const when = c.date ? new Date(c.date).toLocaleString() : '';
                  await addComment(
                    target,
                    tProject.id,
                    id,
                    `<p><b>${escapeHtml(c.author)}</b>${when ? ` · ${escapeHtml(when)}` : ''}</p>${body}`,
                  );
                } catch {
                  commentFailures++;
                }
              }
            }
            return notes.length
              ? { status: 'warning' as const, message: notes.join('; ') }
              : { status: 'ok' as const };
          },
        })),
    );
    if (attachmentFailures)
      api.report({
        area,
        severity: 'warning',
        title: 'Attachments not copied',
        detail: `${attachmentFailures} attachment${attachmentFailures === 1 ? '' : 's'} couldn't be copied (see the failures and warnings in the log).`,
      });
    if (commentFailures)
      api.report({
        area,
        severity: 'warning',
        title: 'Comments not copied',
        detail: `${commentFailures} comment${commentFailures === 1 ? '' : 's'} couldn't be added.`,
      });
  }

  // 4. Links between copied items: one task per link, so a link whose other
  // end is copied by a later run (e.g. "Retry failed") is added then.
  let outOfScope = 0;
  const linkTasks = items
    .filter((i) => ids.has(i.sourceKey))
    .flatMap((item) =>
      item.links.map((l) => ({
        key: `link:${item.sourceKey}>${l.rel}>${l.targetKey}`,
        label: `${item.sourceKey} → ${l.targetKey} (${l.rel.split('.').pop()})`,
        journal: { kind: 'link', sourceId: `${item.sourceKey}>${l.rel}>${l.targetKey}` },
        run: async () => {
          const to = ids.get(l.targetKey);
          if (!to) {
            outOfScope++;
            // Not journalled as done: a later run adds it once the other item exists.
            return { status: 'skipped' as const, message: 'The linked item was not migrated.' };
          }
          try {
            await updateWorkItem(
              target,
              Number(ids.get(item.sourceKey)),
              [
                {
                  op: 'add',
                  path: '/relations/-',
                  value: {
                    rel: l.rel,
                    url: `https://dev.azure.com/${encodeURIComponent(org)}/_apis/wit/workItems/${to}`,
                  },
                },
              ],
              { bypassRules: bypass, suppressNotifications: true },
            );
          } catch (e) {
            if (
              e instanceof AdoError &&
              e.kind === 'rejected' &&
              /already exists|duplicate/i.test(e.message)
            ) {
              return { status: 'ok' as const, message: 'Already linked.' };
            }
            if (e instanceof AdoError && e.kind === 'rejected') {
              return {
                status: 'warning' as const,
                message: `Rejected by Azure DevOps: ${e.message}`,
              };
            }
            throw e;
          }
          return { status: 'ok' as const };
        },
      })),
    );
  await api.phase('Linking work items', linkTasks);

  // Summary report items.
  const unsupported = items.reduce((n, i) => n + i.unsupportedLinks, 0);
  if (outOfScope)
    api.report({
      area,
      severity: 'warning',
      title: 'Links to items outside the migration',
      detail: `${outOfScope} link${outOfScope === 1 ? '' : 's'} pointed at items that weren't migrated and were left out.`,
    });
  if (unsupported)
    api.report({
      area,
      severity: 'info',
      title: 'Commit, pull request and build links',
      detail: `${unsupported} link${unsupported === 1 ? '' : 's'} to code, builds or other artifacts ${unsupported === 1 ? "wasn't" : "weren't"} recreated.`,
    });
  if (imageFailures)
    api.report({
      area,
      severity: 'warning',
      title: 'Inline images',
      detail: `${imageFailures} inline image${imageFailures === 1 ? '' : 's'} couldn't be copied and still point at the source.`,
    });
  if (rejectedRetries)
    api.report({
      area,
      severity: 'warning',
      title: 'Fields rejected',
      detail: `${rejectedRetries} item${rejectedRetries === 1 ? '' : 's'} were created with only the core fields because the target rejected a value. Each one is marked in the log.`,
    });
  if (stateFailures)
    api.report({
      area,
      severity: 'action',
      title: 'Fix states',
      detail: `${stateFailures} item${stateFailures === 1 ? '' : 's'} couldn't be moved to their mapped state.`,
    });
  if (!m.users.enabled) {
    api.report({
      area,
      severity: 'info',
      title: 'Assignments not copied',
      detail:
        'User mapping was off, so assigned-to and other people fields are empty. The original names are in each description.',
    });
  }
  api.report([
    {
      area,
      severity: 'info',
      title: 'History not replayed',
      detail:
        'Each item starts with one revision; the source history is not copied. Comments are copied with their original author and date in the text.',
    },
    {
      area,
      severity: 'action',
      title: 'Recreate boards, queries and dashboards',
      detail:
        'Board columns, swimlanes, card styles, shared queries and dashboards are not copied.',
      targetUrl: adoLinks.queries(org, tProject.name),
    },
  ]);
}
