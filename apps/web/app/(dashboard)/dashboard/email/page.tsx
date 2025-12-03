"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Dialog, Menu, Transition } from '@headlessui/react';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Mail, Search, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../../lib/api';

interface SESEmailIdentity {
  email: string;
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
  verificationToken?: string;
}

interface EmailManagementOverview {
  identities: SESEmailIdentity[];
  sendQuota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null;
  domains: string[];
}

export default function EmailPage() {
  const [data, setData] = useState<EmailManagementOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [domainSearchTerm, setDomainSearchTerm] = useState('');
  const [showAllDomains, setShowAllDomains] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const loadIdentities = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const overview = await apiFetch<EmailManagementOverview>('email/identities');
      setData(overview);
      // Initialize: show all domains by default
      setSelectedDomains(new Set());
      setShowAllDomains(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load email identities';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadIdentities();
  }, []);

  const handleVerifyEmail = async (email: string) => {
    setIsActionLoading((prev) => ({ ...prev, [email]: true }));
    setActionMessage(null);
    try {
      await apiFetch('email/identities/verify', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setActionMessage({
        type: 'success',
        text: `Verification email sent to ${email}. Please check your inbox.`,
      });
      // Reload identities after verification
      await loadIdentities();
      // Clear message after 5 seconds
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification email';
      setActionMessage({
        type: 'error',
        text: message,
      });
      // Clear error message after 5 seconds
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, [email]: false }));
    }
  };

  const handleDeleteIdentity = async (identity: string) => {
    if (!confirm(`Are you sure you want to delete ${identity}? This action cannot be undone.`)) {
      return;
    }

    // Strip *@ prefix for domain identities (AWS SES expects just the domain name)
    const actualIdentity = identity.startsWith('*@') ? identity.substring(2) : identity;

    setIsActionLoading((prev) => ({ ...prev, [identity]: true }));
    setActionMessage(null);
    try {
      await apiFetch(`email/identities/${encodeURIComponent(actualIdentity)}`, {
        method: 'DELETE',
      });
      setActionMessage({
        type: 'success',
        text: `Identity ${identity} deleted successfully.`,
      });
      // Reload identities after deletion
      await loadIdentities();
      // Clear message after 5 seconds
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete identity';
      setActionMessage({
        type: 'error',
        text: message,
      });
      // Clear error message after 5 seconds
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, [identity]: false }));
    }
  };

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return 'Email address is required';
    }
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Please enter a valid email address';
    }
    
    // Check for common invalid patterns
    if (email.includes('..') || email.startsWith('.') || email.startsWith('@')) {
      return 'Please enter a valid email address';
    }
    
    return null;
  };

  const handleAddEmail = async () => {
    const trimmedEmail = newEmail.trim();
    const validationError = validateEmail(trimmedEmail);
    
    if (validationError) {
      setEmailError(validationError);
      setSubmitMessage(null);
      return;
    }
    
    setEmailError(null);
    setSubmitMessage(null);
    setIsSubmitting(true);
    
    try {
      await apiFetch('email/identities/verify', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail }),
      });
      
      setSubmitMessage({
        type: 'success',
        text: `Verification email sent to ${trimmedEmail}. Please check your inbox.`,
      });
      
      // Reload identities after verification
      await loadIdentities();
      
      // Close modal after 2 seconds on success
      setTimeout(() => {
        setIsAddModalOpen(false);
        setNewEmail('');
        setSubmitMessage(null);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification email';
      setSubmitMessage({
        type: 'error',
        text: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAddModal = () => {
    setNewEmail('');
    setEmailError(null);
    setSubmitMessage(null);
    setIsSubmitting(false);
    setIsAddModalOpen(true);
  };

  const handleShowAllToggle = () => {
    setShowAllDomains(true);
    setSelectedDomains(new Set());
  };

  const toggleDomain = (domain: string) => {
    setShowAllDomains(false);
    setSelectedDomains((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(domain)) {
        newSet.delete(domain);
        // If no domains selected, show all
        if (newSet.size === 0) {
          setShowAllDomains(true);
        }
      } else {
        newSet.add(domain);
      }
      return newSet;
    });
  };

  // Filter domains based on search term
  const filteredDomains = useMemo(() => {
    if (!data) return [];
    if (!domainSearchTerm) return data.domains;
    const search = domainSearchTerm.toLowerCase();
    return data.domains.filter((domain) => domain.toLowerCase().includes(search));
  }, [data, domainSearchTerm]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Verified':
        return 'bg-emerald-500';
      case 'Pending':
        return 'bg-amber-400';
      case 'Failed':
        return 'bg-rose-500';
      default:
        return 'bg-slate-400';
    }
  };

  // Filter identities by selected domains
  const filteredByDomain = useMemo(() => {
    if (!data) return [];
    // If "Show all" is selected or no domains are selected, show all identities
    if (showAllDomains || selectedDomains.size === 0) return data.identities;
    return data.identities.filter((identity) => selectedDomains.has(identity.domain));
  }, [data, selectedDomains, showAllDomains]);

  // Define columns (after handlers are defined)
  const columns = useMemo<ColumnDef<SESEmailIdentity>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email Address',
        cell: (info) => (
          <span className="font-medium text-slate-200">{info.getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'domain',
        header: 'Domain',
        cell: (info) => <span className="text-slate-300">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (info) => {
          const status = info.getValue() as string;
          const statusColor = getStatusColor(status);
          return (
            <div className="flex items-center space-x-2">
              <span className={`inline-block w-3 h-3 rounded-full ${statusColor}`} />
              <span className="text-slate-300">{status}</span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const identity = info.row.original;
          const isLoading = isActionLoading[identity.email] || isActionLoading[identity.domain] || false;

          return (
            <div className="flex items-center justify-end space-x-3">
              {identity.status !== 'Verified' && (
                <button
                  type="button"
                  onClick={() => handleVerifyEmail(identity.email)}
                  disabled={isLoading}
                  className="text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  title="Send Verification Email"
                >
                  <Mail className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDeleteIdentity(identity.email)}
                disabled={isLoading}
                className="text-rose-400 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title="Delete Email"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          );
        },
      },
    ],
    [isActionLoading],
  );

  // Create table instance
  const table = useReactTable({
    data: filteredByDomain,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
      globalFilter: searchTerm,
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const email = row.original.email.toLowerCase();
      const domain = row.original.domain.toLowerCase();
      const search = filterValue.toLowerCase();
      return email.includes(search) || domain.includes(search);
    },
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">SES Email Management</h1>
          <p className="text-sm text-slate-400">Manage verified identities and domains for your AWS SES account</p>
        </header>
        <div className="text-center py-12 text-slate-400">Loading email identities...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">SES Email Management</h1>
          <p className="text-sm text-slate-400">Manage verified identities and domains for your AWS SES account</p>
        </header>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          {error ?? 'Failed to load email identities'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">SES Email Management</h1>
        <p className="text-sm text-slate-400">Manage verified identities and domains for your AWS SES account</p>
      </header>

      {/* Send Quota Info */}
      {data.sendQuota && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Send Quota</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Sent (Last 24h):</span>
              <span className="ml-2 font-semibold text-slate-200">
                {data.sendQuota.sentLast24Hours.toLocaleString()} / {data.sendQuota.max24HourSend.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Max Send Rate:</span>
              <span className="ml-2 font-semibold text-slate-200">
                {data.sendQuota.maxSendRate.toLocaleString()} emails/second
              </span>
            </div>
            <div>
              <span className="text-slate-400">Usage:</span>
              <span className="ml-2 font-semibold text-slate-200">
                {data.sendQuota.max24HourSend > 0
                  ? ((data.sendQuota.sentLast24Hours / data.sendQuota.max24HourSend) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Action Feedback Message */}
      {actionMessage && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            actionMessage.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Filters Section */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Domain Filter */}
          <Menu as="div" className="relative inline-block text-left">
            <Menu.Button className="inline-flex justify-between items-center w-64 rounded-md border border-slate-700 bg-slate-900 text-slate-200 text-sm px-4 py-2 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-slate-900">
              Filter by Domain
              <ChevronDown className="h-4 w-4 ml-2" fill="currentColor" aria-hidden="true" />
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute left-0 z-10 mt-2 w-64 origin-top-left rounded-md bg-slate-900 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none max-h-96 overflow-auto">
                <div className="p-2">
                  {/* Search Input */}
                  <div className="mb-2 sticky top-0 bg-slate-900 z-10 pb-2">
                    <input
                      type="text"
                      placeholder="Search domains..."
                      value={domainSearchTerm}
                      onChange={(e) => setDomainSearchTerm(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  {/* Show All Option */}
                  <Menu.Item>
                    {({ active }) => (
                      <label
                        className={`flex items-center space-x-2 text-sm text-slate-200 cursor-pointer px-2 py-2.5 rounded-sm ${
                          active ? 'bg-slate-800' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={showAllDomains}
                          onChange={handleShowAllToggle}
                          className="hidden peer"
                        />
                        <span
                          className={`relative mr-3 flex items-center justify-center p-1 peer-checked:before:hidden before:block before:absolute before:w-full before:h-full before:bg-slate-900 w-5 h-5 cursor-pointer ${
                            showAllDomains ? 'bg-brand' : 'bg-slate-800'
                          } border border-slate-600 rounded-sm overflow-hidden`}
                        >
                          {showAllDomains && (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-full fill-white"
                              viewBox="0 0 520 520"
                            >
                              <path d="M79.423 240.755a47.529 47.529 0 0 0-36.737 77.522l120.73 147.894a43.136 43.136 0 0 0 36.066 16.009c14.654-.787 27.884-8.626 36.319-21.515L486.588 56.773a6.13 6.13 0 0 1 .128-.2c2.353-3.613 1.59-10.773-3.267-15.271a13.321 13.321 0 0 0-19.362 1.343q-.135.166-.278.327L210.887 328.736a10.961 10.961 0 0 1-15.585.843l-83.94-76.386a47.319 47.319 0 0 0-31.939-12.438z" />
                            </svg>
                          )}
                        </span>
                        <span>Show all</span>
                      </label>
                    )}
                  </Menu.Item>

                  {/* Domain Options */}
                  <div className="space-y-0">
                    {filteredDomains.length === 0 ? (
                      <div className="px-2 py-2.5 text-sm text-slate-400">No domains found</div>
                    ) : (
                      filteredDomains.map((domain) => (
                        <Menu.Item key={domain}>
                          {({ active }) => (
                            <label
                              className={`flex items-center space-x-2 text-sm text-slate-200 cursor-pointer px-2 py-2.5 rounded-sm ${
                                active ? 'bg-slate-800' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedDomains.has(domain)}
                                onChange={() => toggleDomain(domain)}
                                className="hidden peer"
                              />
                              <span
                                className={`relative mr-3 flex items-center justify-center p-1 peer-checked:before:hidden before:block before:absolute before:w-full before:h-full before:bg-slate-900 w-5 h-5 cursor-pointer ${
                                  selectedDomains.has(domain) ? 'bg-brand' : 'bg-slate-800'
                                } border border-slate-600 rounded-sm overflow-hidden`}
                              >
                                {selectedDomains.has(domain) && (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="w-full fill-white"
                                    viewBox="0 0 520 520"
                                  >
                                    <path d="M79.423 240.755a47.529 47.529 0 0 0-36.737 77.522l120.73 147.894a43.136 43.136 0 0 0 36.066 16.009c14.654-.787 27.884-8.626 36.319-21.515L486.588 56.773a6.13 6.13 0 0 1 .128-.2c2.353-3.613 1.59-10.773-3.267-15.271a13.321 13.321 0 0 0-19.362 1.343q-.135.166-.278.327L210.887 328.736a10.961 10.961 0 0 1-15.585.843l-83.94-76.386a47.319 47.319 0 0 0-31.939-12.438z" />
                                  </svg>
                                )}
                              </span>
                              <span>{domain}</span>
                            </label>
                          )}
                        </Menu.Item>
                      ))
                    )}
                  </div>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Search */}
          <div className="flex items-center w-full md:w-80 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
            <Search className="h-5 w-5 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent focus:outline-none w-full text-slate-200 placeholder:text-slate-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-200 ml-2"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Add Email */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="bg-brand hover:bg-brand/90 text-brand-foreground px-4 py-2 rounded-md font-medium transition"
          >
            + Add New Email
          </button>
        </div>
      </section>

      {/* Email Table */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-900/80 text-left text-slate-400 uppercase text-xs font-semibold border-b border-slate-800">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-6 py-3">
                      {header.isPlaceholder ? null : (
                        <div
                          className={
                            header.column.getCanSort()
                              ? 'cursor-pointer select-none hover:text-slate-200 flex items-center gap-2'
                              : ''
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="text-slate-500">
                              {{
                                asc: '↑',
                                desc: '↓',
                              }[header.column.getIsSorted() as string] ?? '⇅'}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-800">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center text-slate-400 py-6">
                    {data.identities.length === 0
                      ? 'No email identities found. Add an email to get started.'
                      : 'No matching emails found'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-900/60">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length,
              )}{' '}
              of {table.getFilteredRowModel().rows.length} results
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Rows per page:</span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => {
                  table.setPageSize(Number(e.target.value));
                }}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {[10, 25, 50, 100].map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-400">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Add Email Modal */}
      <Transition appear show={isAddModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsAddModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    Add New Email Identity
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-slate-400">
                    Enter an email address to verify. A verification email will be sent to this address.
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleAddEmail();
                    }}
                    className="mt-6 space-y-4"
                  >
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={newEmail}
                        onChange={(e) => {
                          setNewEmail(e.target.value);
                          setEmailError(null);
                          setSubmitMessage(null);
                        }}
                        placeholder="example@domain.com"
                        disabled={isSubmitting}
                        className={`w-full rounded-md border ${
                          emailError ? 'border-rose-500' : 'border-slate-700'
                        } bg-slate-900 px-4 py-2 text-slate-200 placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50 disabled:cursor-not-allowed`}
                        autoFocus
                      />
                      {emailError && (
                        <p className="mt-1 text-sm text-rose-400">{emailError}</p>
                      )}
                    </div>

                    {submitMessage && (
                      <div
                        className={`rounded-md border px-4 py-3 text-sm ${
                          submitMessage.type === 'success'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                        }`}
                      >
                        {submitMessage.text}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddModalOpen(false);
                          setNewEmail('');
                          setEmailError(null);
                          setSubmitMessage(null);
                          setIsSubmitting(false);
                        }}
                        disabled={isSubmitting}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitMessage?.type === 'success' ? 'Close' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || submitMessage?.type === 'success'}
                        className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-brand-foreground px-4 py-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : submitMessage?.type === 'success' ? (
                          'Sent!'
                        ) : (
                          'Send Verification Email'
                        )}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

