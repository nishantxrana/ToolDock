import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, History, Minus, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { deleteJob, listJobs, pruneOldJobs, type Job } from '@/lib/migration/journal';
import { MIGRATIONS } from './registry';
import { DesktopOnly } from './components/Wizard';

const STATUS_BADGE: Record<
  Job['status'],
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  running: { label: 'Interrupted', variant: 'warning' },
  paused: { label: 'Paused', variant: 'warning' },
  done: { label: 'Finished', variant: 'success' },
  failed: { label: 'Stopped', variant: 'destructive' },
  cancelled: { label: 'Stopped', variant: 'warning' },
};

function describe(job: Job) {
  const side = (e: Job['source']) =>
    e.kind === 'jira' ? `${e.site}.atlassian.net` : `${e.organization}/${e.projectName ?? '?'}`;
  return `${side(job.source)} → ${side(job.target)}`;
}

export default function MigrateHome() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  const refresh = () =>
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]));

  useEffect(() => {
    void pruneOldJobs()
      .catch(() => {})
      .then(refresh);
  }, []);

  return (
    <DesktopOnly>
      <PageLayout
        title="Migrate"
        icon={Truck}
        description="Copy work from one Azure DevOps project or organization to another, or from Jira Cloud into Azure Boards. Use the same organization on both sides to move between projects."
      >
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {MIGRATIONS.map((m) => (
            <Link
              key={m.id}
              to={m.path}
              className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-accent text-accent-foreground">
                  <m.icon className="h-[18px] w-[18px]" />
                </span>
                <h2 className="font-display text-base font-semibold">{m.title}</h2>
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-13 text-muted-foreground">{m.description}</p>
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <ul className="space-y-1">
                  {m.copies.map((c) => (
                    <li key={c} className="flex gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" strokeWidth={3} />
                      {c}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1 text-muted-foreground">
                  {m.skips.map((c) => (
                    <li key={c} className="flex gap-1.5">
                      <Minus className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={3} />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </Link>
          ))}
        </div>

        <SectionCard
          title={
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4" />
              Earlier migrations
            </span>
          }
          description="Kept in this browser for 30 days: progress and reports only, never tokens."
        >
          {jobs === null ? (
            <p className="text-13 text-muted-foreground">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-13 text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {jobs.map((job) => {
                const def = MIGRATIONS.find((m) => m.id === job.type);
                const badge = STATUS_BADGE[job.status];
                return (
                  <li key={job.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    {def && <def.icon className="h-4 w-4 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-13 font-medium">{job.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {describe(job)} · {new Date(job.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {job.counts && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {job.counts.ok} copied · {job.counts.failed} failed
                      </span>
                    )}
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => def && navigate(`${def.path}?job=${job.id}`)}
                    >
                      {job.status === 'done' ? 'Report' : 'Resume'}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Delete ${job.title}`}
                      onClick={() => void deleteJob(job.id).then(refresh)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-13">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-muted-foreground">
            Tokens stay in this tab's memory unless you lock them (encrypted, 30 minutes). Requests
            go through this site's proxy straight to Azure DevOps or Jira; the page can't send them
            anywhere else. Use a read-only token for the source, and revoke both tokens when you're
            done.
          </p>
        </div>
      </PageLayout>
    </DesktopOnly>
  );
}
