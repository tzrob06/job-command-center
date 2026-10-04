import React, { useState, useEffect } from 'react';
import { db, exportAllData } from '../db';
import { PageHeader, ConfirmDialog, StatCard } from '../components/ui';
import { useApp } from '../App';
import { format } from 'date-fns';

export default function Settings() {
  const { handleClearSamples, showToast, refreshKey, refresh } = useApp();
  
  const [stats, setStats] = useState({
    applications: 0,
    contacts: 0,
    interviews: 0,
    dashboards: 0
  });
  
  const [showClearSampleConfirm, setShowClearSampleConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      const apps = await db.applications.count();
      const contacts = await db.contacts.count();
      const interviews = await db.interviews.count();
      const dashboards = await db.dashboards.count();
      
      setStats({
        applications: apps,
        contacts,
        interviews,
        dashboards
      });
    };
    loadStats();
  }, [refreshKey]);

  const onConfirmClearSamples = async () => {
    await handleClearSamples();
    setShowClearSampleConfirm(false);
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      const data = await exportAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jcc-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export data', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const onConfirmClearAll = async () => {
    try {
      await db.applications.clear();
      await db.contacts.clear();
      await db.interviews.clear();
      await db.applicationContacts.clear();
      await db.interviewContacts.clear();
      await db.dashboards.clear();
      await db.integrations.clear();
      
      showToast('All database records have been permanently deleted', 'success');
      refresh();
      setShowClearAllConfirm(false);
    } catch (err) {
      console.error('Failed to clear database', err);
      showToast('Failed to clear database', 'error');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl">
      <PageHeader 
        title="Settings & Data" 
        subtitle="Manage your application data and preferences."
      />

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Database Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Applications" value={stats.applications} color="blue" />
          <StatCard label="Contacts" value={stats.contacts} color="purple" />
          <StatCard label="Interviews" value={stats.interviews} color="amber" />
          <StatCard label="Dashboards" value={stats.dashboards} color="green" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Data Management</h2>
        <div className="card p-0 overflow-hidden border border-gray-200">
          <div className="divide-y divide-gray-100">
            <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Export All Data</h3>
                <p className="text-sm text-gray-500 mt-1">Download a JSON copy of your entire database for backup.</p>
              </div>
              <button 
                onClick={handleExportData}
                disabled={isExporting}
                className="btn btn-secondary whitespace-nowrap"
              >
                {isExporting ? 'Exporting...' : 'Export JSON Backup'}
              </button>
            </div>
            
            <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Clear Sample Data</h3>
                <p className="text-sm text-gray-500 mt-1">Remove all the dummy placeholder data that was generated on first load.</p>
              </div>
              <button 
                onClick={() => setShowClearSampleConfirm(true)}
                className="btn btn-ghost text-amber-600 hover:text-amber-700 hover:bg-amber-50 whitespace-nowrap"
              >
                Clear Samples
              </button>
            </div>

            <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-red-50/30">
              <div>
                <h3 className="text-base font-semibold text-red-700">Clear All Data (Danger)</h3>
                <p className="text-sm text-red-500 mt-1">Permanently delete everything in your database. This action cannot be undone.</p>
              </div>
              <button 
                onClick={() => setShowClearAllConfirm(true)}
                className="btn btn-danger whitespace-nowrap"
              >
                Wipe Database
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Account & Privacy</h2>
        <div className="card p-6 bg-blue-50 border-blue-100">
          <div className="flex gap-4">
            <div className="text-blue-600 mt-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Local Only Storage</h3>
              <p className="text-sm text-blue-800 mt-2">
                Job Command Center runs completely in your web browser. All of your data is stored locally using standard web technologies (IndexedDB).
              </p>
              <ul className="list-disc list-inside text-sm text-blue-800 mt-2 space-y-1">
                <li>No account or login is required.</li>
                <li>Your data never leaves your device or gets uploaded to any server.</li>
                <li><strong>Caution:</strong> Clearing your browser data (cache/cookies) for this site will erase all of your records. We strongly recommend making regular exports via the Data Management section above.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">About</h2>
        <div className="card p-6 space-y-4 text-sm text-gray-700">
          <div>
            <span className="font-semibold text-gray-900">App Name:</span> Job Command Center
          </div>
          <div>
            <span className="font-semibold text-gray-900">Version:</span> 1.0.0
          </div>
          <div>
            <span className="font-semibold text-gray-900">Description:</span> A comprehensive personal CRM for managing your job hunt.
          </div>
          <div>
            <span className="font-semibold text-gray-900">Built With:</span> React 18, Dexie.js (IndexedDB), Tailwind CSS, Recharts
          </div>
        </div>
      </section>

      {/* Confirmation Modals */}
      <ConfirmDialog
        open={showClearSampleConfirm}
        onClose={() => setShowClearSampleConfirm(false)}
        onConfirm={onConfirmClearSamples}
        title="Clear Sample Data?"
        message="Are you sure you want to remove all sample records? Any data you have manually added or modified will be kept."
        confirmLabel="Clear Samples"
      />

      <ConfirmDialog
        open={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={onConfirmClearAll}
        title="Wipe Database?"
        message="Are you absolutely sure you want to delete ALL data? This will remove every application, contact, interview, and dashboard setting. This cannot be undone unless you have a JSON backup."
        confirmLabel="Yes, Delete Everything"
        danger={true}
      />
    </div>
  );
}
