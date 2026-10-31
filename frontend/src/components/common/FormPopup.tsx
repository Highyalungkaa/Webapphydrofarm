import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const FormPopup: React.FC<{
  open: boolean; onClose: () => void; closeDisabled?: boolean;
  labelledBy: string; children: React.ReactNode;
}> = ({open,onClose,closeDisabled=false,labelledBy,children}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element=dialog.current;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    element.showModal();
    document.body.style.overflow='hidden';
    return () => {
      element.close();
      document.body.style.overflow=previousOverflow;
      previousFocus?.focus();
    };
  },[open]);
  if(!open)return null;
  return createPortal(<dialog ref={dialog} aria-labelledby={labelledBy}
    onCancel={event=>{event.preventDefault();if(!closeDisabled)onClose();}}
    onClick={event=>{if(event.target===event.currentTarget&&!closeDisabled)onClose();}}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55">
    <div className="max-h-[90dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
  </dialog>,document.body);
};
