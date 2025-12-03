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

interface AwsSecurityGroupRule {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  ipRanges: string[];
  ipv6Ranges: string[];
  direction: 'ingress' | 'egress';
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

export function SecurityGroupTable({ data }: { data: AwsSecurityGroupRule[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<AwsSecurityGroupRule>[] = [
    {
      accessorKey: 'direction',
      header: 'Direction',
      cell: (info) => (
        <span className="capitalize">{String(info.getValue())}</span>
      ),
    },
    {
      accessorKey: 'protocol',
      header: 'Protocol',
      cell: (info) => {
        const protocol = String(info.getValue());
        return protocolMap[protocol] || protocol.toUpperCase();
      },
    },
    {
      id: 'ports',
      header: 'Ports',
      cell: (info) => {
        const row = info.row.original;
        if (row.fromPort !== undefined && row.toPort !== undefined) {
          return row.fromPort === row.toPort ? String(row.fromPort) : `${row.fromPort}–${row.toPort}`;
        }
        return 'All';
      },
    },
    {
      id: 'ipRanges',
      header: 'IP Ranges',
      cell: (info) => {
        const row = info.row.original;
        const allRanges = [...row.ipRanges, ...row.ipv6Ranges];
        if (allRanges.length === 0) {
          return <span className="text-slate-500">Any</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            {allRanges.map((ip, i) => (
              <span key={i} className="font-mono text-xs">
                {ip}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <button className="text-slate-400 hover:text-red-400 transition" title="Delete rule">
          ✕
        </button>
      ),
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
                No Security Group rules found
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

