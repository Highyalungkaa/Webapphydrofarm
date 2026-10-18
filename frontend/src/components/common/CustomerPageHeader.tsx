import React from 'react';

interface CustomerPageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const CustomerPageHeader: React.FC<CustomerPageHeaderProps> = ({ eyebrow, title, description, icon, children }) => (
  <header className="relative isolate overflow-hidden rounded-[2rem] bg-[#103e31] p-6 text-white shadow-[0_20px_60px_-30px_rgba(12,69,48,.65)] sm:rounded-[2.5rem] sm:p-8">
    <span className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[45px] border-lime-300/10" />
    <span className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
    <div className="relative flex items-start justify-between gap-4">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-[11px] font-bold text-lime-200">{eyebrow}</span>
        <h1 className="mt-4 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-emerald-50/80">{description}</p>
        {children && <div className="mt-5 flex flex-wrap gap-2">{children}</div>}
      </div>
      {icon && <span className="hidden h-16 w-16 shrink-0 place-items-center rounded-3xl border border-white/15 bg-white/10 text-lime-300 sm:grid">{icon}</span>}
    </div>
  </header>
);
