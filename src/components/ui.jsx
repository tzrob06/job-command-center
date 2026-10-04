/* ═══════════════════════════════════════════════════════════════════════════
   ui.jsx — Shared, reusable UI components
   ═══════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { statusBadgeClass, sourceBadgeClass } from '../db';

/* ── Modal ─────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-start justify-center pt-[5vh] md:pt-[10vh] overflow-y-auto"
         onClick={onClose}>
      <div
        className={`bg-white rounded-xl shadow-xl w-full mx-4 mb-8 animate-slide-in-up ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Confirm Dialog ───────────────────────────────────────────────────── */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', danger = true }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 animate-slide-in-up" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={onConfirm} className={`${danger ? 'btn-danger' : 'btn-primary'} btn-sm`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Status Badge ─────────────────────────────────────────────────────── */
export function StatusBadge({ status }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{status}</span>;
}

/* ── Source Badge ─────────────────────────────────────────────────────── */
export function SourceBadge({ source }) {
  return <span className={`badge ${sourceBadgeClass(source)}`}>{source}</span>;
}

/* ── Sample Badge ─────────────────────────────────────────────────────── */
export function SampleBadge() {
  return <span className="badge badge-sample text-[10px] px-1.5 py-0">Sample</span>;
}

/* ── Priority Dot ─────────────────────────────────────────────────────── */
export function PriorityDot({ priority }) {
  const colors = { High: 'bg-red-500', Medium: 'bg-amber-500', Low: 'bg-green-500' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`w-2 h-2 rounded-full ${colors[priority] || 'bg-gray-300'}`} />
      {priority}
    </span>
  );
}

/* ── Empty State ──────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {message && <p className="empty-state-text">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Page Header ──────────────────────────────────────────────────────── */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

/* ── Stat Card (for dashboards) ───────────────────────────────────────── */
export function StatCard({ label, value, sublabel, color = 'primary' }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-700 border-primary-200',
    green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    purple:  'bg-violet-50 text-violet-700 border-violet-200',
    gray:    'bg-gray-50 text-gray-700 border-gray-200',
  };
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || colorMap.primary}`}>
      <p className="text-xs font-medium opacity-75 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sublabel && <p className="text-xs opacity-60 mt-1">{sublabel}</p>}
    </div>
  );
}

/* ── Search Input ─────────────────────────────────────────────────────── */
export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
           fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input pl-9 pr-3"
      />
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────────── */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab ${active === t.key ? 'tab-active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Detail Sidebar (slide-in panel) ──────────────────────────────────── */
export function DetailPanel({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-40 animate-slide-in-right overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </>
  );
}

/* ── Link pill (navigable chip) ───────────────────────────────────────── */
export function LinkPill({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 transition-colors"
    >
      {children}
    </button>
  );
}

/* ── Multi-select chips for contacts ──────────────────────────────────── */
export function ContactChipSelect({ contacts, selectedIds, onChange }) {
  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };
  if (!contacts.length) {
    return <p className="text-xs text-gray-400 italic">No contacts available</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {contacts.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => toggle(c.id)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            selectedIds.includes(c.id)
              ? 'bg-primary-100 text-primary-700 border-primary-300'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
