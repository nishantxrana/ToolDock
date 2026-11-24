/** JQL for one project, plus an optional extra condition. */
export function buildJql(projectKey: string, extra: string): string {
  const key = projectKey.replace(/"/g, '\\"');
  const cond = extra.trim().replace(/\s+order\s+by\s+.*$/i, '');
  return `project = "${key}"${cond ? ` AND (${cond})` : ''} ORDER BY created ASC`;
}
