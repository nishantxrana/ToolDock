import type { ReactNode } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import type { MigrationDefinition } from '../registry';
import { Stepper, type WizardStep } from './Wizard';

export function MigrationShell({
  def,
  steps,
  step,
  onStep,
  locked,
  children,
}: {
  def: MigrationDefinition;
  steps: WizardStep[];
  step: number;
  onStep: (i: number) => void;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <PageLayout title={def.heading} description={def.description} icon={def.icon}>
      <Stepper steps={steps} current={step} onGo={onStep} locked={locked} />
      <div className="rounded-xl border bg-card p-5 shadow-card">{children}</div>
    </PageLayout>
  );
}

/** Small heading used at the top of each step. */
export function StepTitle({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-13 text-muted-foreground">{description}</p>}
    </div>
  );
}
