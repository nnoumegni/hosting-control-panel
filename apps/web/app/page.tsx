import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-24">
      <section className="space-y-6">
        <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-4 py-1 text-sm font-medium text-brand-foreground">
          Hosting Control Panel
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Manage your EC2 hosting platform without cPanel/WHM.
        </h1>
        <p className="max-w-2xl text-lg text-slate-300">
          Provision accounts, automate DNS and SSL, orchestrate backups, and monitor infrastructure health
          through a secure API and modern dashboard tailored for Amazon Linux environments.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-semibold text-brand-foreground transition hover:bg-brand/90"
          >
            Launch console
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
          >
            API docs
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
            <feature.icon className="h-8 w-8 text-brand" />
            <h3 className="mt-4 text-xl font-semibold text-white">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-300">{feature.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

const features = [
  {
    title: 'Provision accounts instantly',
    description: 'Bootstrap Linux users, quotas, vhosts, and PHP runtimes via automated playbooks and AWS SSM.',
    icon: ArrowRight,
  },
  {
    title: 'Centralized DNS automation',
    description: 'Manage Route 53 zones, vanity nameservers, and DNSSEC with audit-ready change history.',
    icon: ArrowRight,
  },
  {
    title: 'SSL & security by default',
    description: 'Issue and renew certificates via ACME, enforce MFA and RBAC, and stream logs to CloudWatch.',
    icon: ArrowRight,
  },
  {
    title: 'Observability built-in',
    description: 'Expose metrics, health, billing, and backup insights to teams or customers in real time.',
    icon: ArrowRight,
  },
];


