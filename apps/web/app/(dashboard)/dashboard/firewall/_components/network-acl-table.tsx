"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';

interface AwsNetworkAclRule {
  ruleNumber: number;
  protocol: string;
  ruleAction: 'allow' | 'deny';
  egress: boolean;
  cidrBlock?: string;
  ipv6CidrBlock?: string;
  portRange?: { from?: number; to?: number };
}

const protocolMap: Record<string, string> = {
  '-1': 'All',
  '6': 'TCP',
  '17': 'UDP',
  '1': 'ICMP',
  tcp: 'TCP',
  udp: 'UDP',
  icmp: 'ICMP',
  all: 'All',
};

export function NetworkAclTable({
  data,
  onDelete,
  deletingRules,
}: {
  data: AwsNetworkAclRule[];
  onDelete: (ruleNumber: number, egress: boolean) => void;
  deletingRules: Set<string>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<AwsNetworkAclRule>[] = [
    {
      accessorKey: 'ruleNumber',
      header: 'Rule #',
    },
    {
      accessorKey: 'egress',
      header: 'Direction',
      cell: (info) => (
        <span className="capitalize">{info.getValue() ? 'Egress' : 'Ingress'}</span>
      ),
    },
    {
      accessorKey: 'ruleAction',
      header: 'Action',
      cell: (info) => {
        const action = String(info.getValue());
        return (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
              action === 'allow'
                ? 'bg-sky-500/10 text-sky-200 border-sky-500/40'
                : 'bg-rose-500/10 text-rose-200 border-rose-500/40'
            }`}
          >
            {action}
          </span>
        );
      },
    },
    {
      accessorKey: 'protocol',
      header: 'Protocol',
      cell: (info) => {
        const protocol = String(info.getValue());
        return protocolMap[protocol] || protocol;
      },
    },
    {
      id: 'ports',
      header: 'Ports',
      cell: (info) => {
        const row = info.row.original;
        if (row.portRange?.from !== undefined && row.portRange?.to !== undefined) {
          return row.portRange.from === row.portRange.to
            ? String(row.portRange.from)
            : `${row.portRange.from}–${row.portRange.to}`;
        }
        return 'All';
      },
    },
    {
      id: 'cidrBlock',
      header: 'CIDR Block',
      cell: (info) => {
        const row = info.row.original;
        const blocks = [row.cidrBlock, row.ipv6CidrBlock].filter(Boolean);
        if (blocks.length === 0) {
          return <span className="text-slate-500">Any</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            {blocks.map((block, i) => (
              <span key={i} className="font-mono text-xs">
                {block}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const row = info.row.original;
        const ruleKey = `${row.ruleNumber}-${row.egress}`;
        return (
          <button
            onClick={() => onDelete(row.ruleNumber, row.egress)}
            disabled={deletingRules.has(ruleKey)}
            className="text-slate-400 hover:text-red-400 transition disabled:cursor-not-allowed disabled:opacity-60"
            title={`Delete Network ACL rule #${row.ruleNumber} (${row.egress ? 'Egress' : 'Ingress'})`}
          >
            {deletingRules.has(ruleKey) ? 'Deleting...' : '✕'}
          </button>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="text-slate-400 border-b border-slate-800">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="py-2 text-left"
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      className={
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none hover:text-white'
                          : ''
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: ' ↑',
                        desc: ' ↓',
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-slate-400">
                No Network ACL rules found
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}


