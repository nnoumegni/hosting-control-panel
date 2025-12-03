"use client";

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';

import { CreateFirewallRuleForm } from './create-rule-form';

export function CreateFirewallRuleModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const win = (globalThis as unknown as { window?: any }).window;

    if (!win) {
      return;
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsOpen(customEvent.detail);
    };

    (win as any).addEventListener('firewall-advanced-modal-toggle', handler);
    return () => (win as any).removeEventListener('firewall-advanced-modal-toggle', handler);
  }, []);

  const closeModal = () => {
    setIsOpen(false);
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeModal}>
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                  Advanced firewall rule
                </Dialog.Title>
                <p className="mt-1 text-sm text-slate-400">
                  Configure protocols, ports, and additional metadata. Use quick actions for single-IP allow or block.
                </p>
                <div className="mt-6">
                  <CreateFirewallRuleForm />
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

