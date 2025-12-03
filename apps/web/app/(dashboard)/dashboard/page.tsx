import { Activity, Cloud, Gauge, Server } from 'lucide-react';

const cards = [
  {
    name: 'Active accounts',
    value: '128',
    change: '+12 this week',
    icon: Server,
  },
  {
    name: 'Pending provisioning jobs',
    value: '5',
    change: '2 running',
    icon: Activity,
  },
  {
    name: 'Average CPU usage',
    value: '43%',
    change: 'Across all EC2 nodes',
    icon: Gauge,
  },
  {
    name: 'Certificates expiring soon',
    value: '3',
    change: 'Auto-renew triggered',
    icon: Cloud,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.name} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>{card.name}</span>
              <card.icon className="h-4 w-4 text-brand" />
            </div>
            <div className="mt-4 text-2xl font-semibold text-white">{card.value}</div>
            <p className="text-xs text-slate-500">{card.change}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Provisioning timeline</h2>
          <p className="mt-2 text-sm text-slate-400">Track real-time provisioning jobs and automation workflows.</p>
          <div className="mt-6 grid gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-200">Job #{1240 + index}</p>
                  <p className="text-xs text-slate-500">Create account for customer {String.fromCharCode(65 + index)}</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Completed
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Alerts</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              Route 53 zone sync pending for domain `example.net`.
            </li>
            <li className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3">
              High CPU detected on EC2 instance `cp-prod-02`.
            </li>
            <li className="rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-3">
              Scheduled backup completed for reseller `Northwind`.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

