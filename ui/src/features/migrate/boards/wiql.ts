/** A WIQL string literal. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function buildWiql(
  project: string,
  o: { types: string; states: string; area: string; changedSince: string; closed: boolean },
): string {
  const where = [`[System.TeamProject] = ${lit(project)}`];
  const list = (v: string) =>
    v
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  if (list(o.types).length)
    where.push(`[System.WorkItemType] IN (${list(o.types).map(lit).join(', ')})`);
  if (list(o.states).length)
    where.push(`[System.State] IN (${list(o.states).map(lit).join(', ')})`);
  if (!o.closed) where.push(`[System.State] NOT IN ('Closed', 'Done', 'Removed')`);
  if (o.area.trim()) where.push(`[System.AreaPath] UNDER ${lit(o.area.trim())}`);
  if (o.changedSince) where.push(`[System.ChangedDate] >= ${lit(o.changedSince)}`);
  return `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.Id]`;
}
