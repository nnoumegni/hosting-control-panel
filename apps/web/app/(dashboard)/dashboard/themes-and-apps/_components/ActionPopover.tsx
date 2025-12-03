'use client';

import { useState, useRef, useEffect } from 'react';
import { Info, Eye, CreditCard, Download, CloudUpload, Edit, Trash2, MoreVertical } from 'lucide-react';

interface Action {
  title: string;
  value: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface ActionPopoverProps {
  actions: Action[];
  trigger?: React.ReactNode;
  position?: 'bottom' | 'top' | 'left' | 'right';
}

export function ActionPopover({
  actions,
  trigger,
  position = 'bottom',
}: ActionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getIcon = (value: string) => {
    switch (value) {
      case 'details':
        return <Info className="h-4 w-4" />;
      case 'preview':
        return <Eye className="h-4 w-4" />;
      case 'buy':
        return <CreditCard className="h-4 w-4" />;
      case 'download':
        return <Download className="h-4 w-4" />;
      case 'deploy':
        return <CloudUpload className="h-4 w-4" />;
      case 'edit':
        return <Edit className="h-4 w-4" />;
      case 'delete':
        return <Trash2 className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div ref={popoverRef} className="relative">
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger || (
          <button className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800/50 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white">
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      {isOpen && (
        <div className={`absolute ${position === 'bottom' ? 'top-full right-0 mt-2' : position === 'top' ? 'bottom-full right-0 mb-2' : position === 'left' ? 'right-full top-0 mr-2' : 'left-full top-0 ml-2'} z-50 min-w-[150px] rounded-lg border border-slate-700 bg-slate-900 shadow-lg`}>
          {actions.map((action, index) => (
            <div
              key={index}
              className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm text-slate-300 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-slate-800 hover:text-white"
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
            >
              {action.icon || getIcon(action.value)}
              <span>{action.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

