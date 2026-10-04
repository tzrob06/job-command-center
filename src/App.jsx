/* ═══════════════════════════════════════════════════════════════════════════
   App.jsx — Root component: routing, global data loading, context provider
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { db, seedSampleData, clearSampleData } from './db';
import Layout from './components/Layout';
import ApplicationsPage from './pages/Applications';
import ContactsPage from './pages/Contacts';
import InterviewsPage from './pages/Interviews';
import DashboardPage from './pages/Dashboard';
import IntegrationsPage from './pages/Integrations';
import SettingsPage from './pages/Settings';

// ── Global App Context ───────────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast]           = useState(null);

  // Refresh trigger — bump this to reload all data consumers
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Toast helper
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Seed sample data on first load
  useEffect(() => {
    seedSampleData()
      .then(() => setLoading(false))
      .catch((err) => {
        console.error('Failed to seed sample data:', err);
        setLoading(false);
      });
  }, []);

  // Handle clear sample data
  const handleClearSamples = useCallback(async () => {
    await clearSampleData();
    refresh();
    showToast('Sample data removed');
  }, [refresh, showToast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading Job Command Center…</p>
        </div>
      </div>
    );
  }

  const ctx = { refreshKey, refresh, showToast, handleClearSamples };

  return (
    <AppContext.Provider value={ctx}>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/:id" element={<DashboardPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/applications/:id" element={<ApplicationsPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactsPage />} />
          <Route path="/interviews" element={<InterviewsPage />} />
          <Route path="/interviews/:id" element={<InterviewsPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-in-up">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${
              toast.type === 'error' ? 'bg-red-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-green-600'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
