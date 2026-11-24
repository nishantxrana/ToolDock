/**
 * Builds the Authorization header for Azure DevOps PAT auth.
 *
 * ADO expects HTTP Basic with an empty username and the PAT as the password:
 *   Authorization: Basic base64(":" + PAT)
 *
 * The PAT is used transiently to build this header and is never stored or logged.
 */
export function buildAuthHeader(pat: string): string {
  const token = btoa(`:${pat}`);
  return `Basic ${token}`;
}

/**
 * Jira Cloud API-token auth: HTTP Basic with the account email and the token.
 * Built per request and never stored or logged.
 */
export function buildJiraAuthHeader(email: string, token: string): string {
  const bytes = new TextEncoder().encode(`${email}:${token}`);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}
