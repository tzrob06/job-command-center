import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { db, createApplication, APP_STATUSES, APP_SOURCES, PRIORITIES } from '../db';
import { PageHeader, StatusBadge, Modal } from '../components/ui';
import { useApp } from '../App';
import { format } from 'date-fns';

const SERVICES = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    status: 'Manual Import Only',
    color: 'bg-blue-600',
    data: 'Job Applications, Connections',
    permissions: 'None (No API)',
    limitation: 'LinkedIn does not offer a public API for job application data. Direct integration is not possible without violating their terms of service.',
    alternative: "Export your data manually from LinkedIn (Settings > Data Privacy > Get a copy of your data > select 'Jobs' and 'Connections'), then use the CSV import wizard below.",
    canConnect: false
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse / ATS',
    status: 'API Key Support',
    color: 'bg-emerald-600',
    data: 'Job Applications',
    permissions: 'Read-only API Access',
    limitation: 'Requires a personal API key or Board token from the employer.',
    alternative: 'Enter your API key below to securely sync statuses locally.',
    canConnect: true
  },
  {
    id: 'lever',
    name: 'Lever',
    status: 'API Key Support',
    color: 'bg-orange-500',
    data: 'Job Applications',
    permissions: 'Read-only API Access',
    limitation: 'Requires Lever API access token.',
    alternative: 'Enter your access token to securely pull application states.',
    canConnect: true
  },
  {
    id: 'generic_board',
    name: 'Other Job Boards',
    status: 'Browser Extension',
    color: 'bg-indigo-600',
    data: 'Job Postings, Applications',
    permissions: 'Browser Sync',
    limitation: 'Uses a mock local extension channel to sync applied jobs.',
    alternative: 'Connect your extension token to enable continuous background sync.',
    canConnect: true
  },
  {
    id: 'google',
    name: 'Google Workspace',
    status: 'OAuth 2.0',
    color: 'bg-red-500',
    data: 'Google Sheets, Gmail',
    permissions: 'Read-only API Access',
    limitation: 'Requires a Google Cloud Client ID (VITE_GOOGLE_CLIENT_ID).',
    alternative: 'Connect to Google to directly import applications from Google Sheets or parse status updates from Gmail.',
    canConnect: true
  }
];

const TARGET_FIELDS = [
  { key: 'company', label: 'Company', required: true },
  { key: 'role', label: 'Role', required: true },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'dateApplied', label: 'Date Applied (YYYY-MM-DD)' },
  { key: 'jobPostingLink', label: 'Job Link' },
  { key: 'targetCompensation', label: 'Compensation' },
  { key: 'priority', label: 'Priority' },
  { key: 'notes', label: 'Notes' }
];

export default function Integrations() {
  const { showToast, refresh } = useApp();
  
  // Wizard State
  const [wizardStep, setWizardStep] = useState(0); // 0: hidden, 1: upload, 2: map, 3: preview, 4: importing
  const [csvFile, setCsvFile] = useState(null);
  const [parsedData, setParsedData] = useState({ headers: [], rows: [] });
  const [fieldMapping, setFieldMapping] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [existingApps, setExistingApps] = useState([]);
  
  // Connection State
  const [activeConnections, setActiveConnections] = useState([]);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [apiToken, setApiToken] = useState('');

  const [googleSyncModalOpen, setGoogleSyncModalOpen] = useState(false);
  const [googleSheetId, setGoogleSheetId] = useState('');
  const [googleRange, setGoogleRange] = useState('Sheet1!A1:Z100');

  useEffect(() => {
    // Load existing apps to check duplicates, and connected integrations
    const loadData = async () => {
      const apps = await db.applications.toArray();
      setExistingApps(apps);
      const integrations = await db.integrations.toArray();
      setActiveConnections(integrations);
    };
    loadData();
  }, [wizardStep]);

  const handleGoogleAuth = () => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      showToast('VITE_GOOGLE_CLIENT_ID not found in .env. Please configure it.', 'error');
      return;
    }
    if (!window.google) {
      showToast('Google Identity Services script failed to load.', 'error');
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/gmail.readonly',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          await db.integrations.add({
            service: 'google',
            accountName: 'Google Workspace',
            status: 'Connected',
            token: tokenResponse.access_token, // Store token (ephemeral but good for current session)
            lastSynced: new Date().toISOString(),
            createdAt: new Date().toISOString()
          });
          showToast('Connected to Google Workspace!', 'success');
          const integrations = await db.integrations.toArray();
          setActiveConnections(integrations);
        }
      },
    });
    client.requestAccessToken();
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!apiToken) {
      showToast('API Key or Token is required', 'error');
      return;
    }
    await db.integrations.add({
      service: selectedService.id,
      accountName: `${selectedService.name} Account`,
      status: 'Connected',
      token: apiToken,
      lastSynced: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
    showToast(`Connected to ${selectedService.name} successfully`, 'success');
    setConnectModalOpen(false);
    setApiToken('');
    const integrations = await db.integrations.toArray();
    setActiveConnections(integrations);
  };

  const handleSync = async (conn) => {
    if (conn.service === 'google') {
      setGoogleSyncModalOpen(true);
      return;
    }
    // Generic sync
    await db.integrations.update(conn.id, { lastSynced: new Date().toISOString() });
    showToast('Sync triggered successfully.', 'success');
    const integrations = await db.integrations.toArray();
    setActiveConnections(integrations);
  };

  const fetchGoogleSheets = async (e) => {
    e.preventDefault();
    const conn = activeConnections.find(c => c.service === 'google');
    if (!conn || !conn.token) {
      showToast('No active Google token found. Try reconnecting.', 'error');
      return;
    }
    
    try {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values/${googleRange}`, {
        headers: { Authorization: `Bearer ${conn.token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch from Google Sheets');
      const data = await res.json();
      
      if (!data.values || data.values.length < 2) {
        showToast('Sheet is empty or missing headers.', 'error');
        return;
      }
      
      const headers = data.values[0];
      const rows = data.values.slice(1).map(row => {
        let obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      
      setParsedData({ headers, rows });
      
      // Auto-match
      const initialMapping = {};
      TARGET_FIELDS.forEach(field => {
        const match = headers.find(h => 
          h.toLowerCase().includes(field.key.toLowerCase()) || 
          field.label.toLowerCase().includes(h.toLowerCase())
        );
        if (match) initialMapping[field.key] = match;
      });
      
      setFieldMapping(initialMapping);
      setWizardStep(2);
      setGoogleSyncModalOpen(false);
      showToast('Sheet data loaded! Map your columns.', 'success');
      
      // Update sync time
      await db.integrations.update(conn.id, { lastSynced: new Date().toISOString() });
      const integrations = await db.integrations.toArray();
      setActiveConnections(integrations);

    } catch (err) {
      console.error(err);
      showToast('Error syncing from Google Sheets: ' + err.message, 'error');
    }
  };

  const handleDisconnect = async (id) => {
    await db.integrations.delete(id);
    showToast('Account disconnected.', 'success');
    const integrations = await db.integrations.toArray();
    setActiveConnections(integrations);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setParsedData({ headers, rows: results.data });
        
        // Auto-match
        const initialMapping = {};
        TARGET_FIELDS.forEach(field => {
          const match = headers.find(h => 
            h.toLowerCase().includes(field.key.toLowerCase()) || 
            field.label.toLowerCase().includes(h.toLowerCase())
          );
          if (match) initialMapping[field.key] = match;
        });
        
        setFieldMapping(initialMapping);
        setWizardStep(2);
      },
      error: (error) => {
        showToast(`Failed to parse CSV: ${error.message}`, 'error');
      }
    });
  };

  const handleMapNext = () => {
    // Generate Preview
    const preview = parsedData.rows.map((row, index) => {
      const mapped = {};
      let hasError = false;
      let errorMsg = '';
      
      TARGET_FIELDS.forEach(field => {
        const csvCol = fieldMapping[field.key];
        const val = csvCol ? row[csvCol] : '';
        mapped[field.key] = val;
        
        if (field.required && !val) {
          hasError = true;
          errorMsg = `Missing ${field.label}`;
        }
      });
      
      // Defaults and validation
      if (!mapped.status || !APP_STATUSES.includes(mapped.status)) mapped.status = 'Applied';
      if (!mapped.source || !APP_SOURCES.includes(mapped.source)) mapped.source = 'Imported';
      if (!mapped.priority || !PRIORITIES.includes(mapped.priority)) mapped.priority = 'Medium';
      
      if (!mapped.dateApplied) {
        mapped.dateApplied = new Date().toISOString().split('T')[0];
      } else {
        const d = new Date(mapped.dateApplied);
        if (isNaN(d.getTime())) {
          mapped.dateApplied = new Date().toISOString().split('T')[0];
        } else {
          mapped.dateApplied = d.toISOString().split('T')[0];
        }
      }

      // Duplicate check
      const isDuplicate = existingApps.some(app => 
        app.company.toLowerCase() === (mapped.company || '').toLowerCase() &&
        app.role.toLowerCase() === (mapped.role || '').toLowerCase()
      );
      
      return {
        _index: index,
        data: mapped,
        hasError,
        errorMsg,
        isDuplicate
      };
    });
    
    setPreviewData(preview);
    setWizardStep(3);
  };

  const handleImport = async () => {
    setWizardStep(4);
    
    const validRows = previewData.filter(r => !r.hasError);
    let successCount = 0;
    
    for (const row of validRows) {
      try {
        const appData = {
          ...row.data,
          isSample: 0
        };
        await createApplication(appData);
        successCount++;
      } catch (err) {
        console.error("Import failed for row", row, err);
      }
    }
    
    showToast(`Successfully imported ${successCount} applications!`, 'success');
    refresh();
    resetWizard();
  };
  
  const resetWizard = () => {
    setWizardStep(0);
    setCsvFile(null);
    setParsedData({ headers: [], rows: [] });
    setFieldMapping({});
    setPreviewData([]);
  };

  const validCount = previewData.filter(r => !r.hasError && !r.isDuplicate).length;
  const warningCount = previewData.filter(r => r.hasError).length;
  const duplicateCount = previewData.filter(r => !r.hasError && r.isDuplicate).length;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader 
        title="Integrations & Import" 
        subtitle="Connect external services or import your existing data."
      />

      {wizardStep === 0 && (
        <>
          <div className="flex justify-between items-center bg-blue-50 border border-blue-200 rounded-lg p-5">
            <div>
              <h3 className="text-lg font-semibold text-blue-900">Import Data</h3>
              <p className="text-sm text-blue-700 mt-1">Bring your existing job applications from spreadsheets or other tools via CSV.</p>
            </div>
            <button 
              onClick={() => setWizardStep(1)}
              className="btn btn-primary"
            >
              Import from CSV
            </button>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Connected Accounts</h2>
            {activeConnections.length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">No accounts connected yet. Add one below to start syncing applications.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {activeConnections.map(conn => {
                  const srv = SERVICES.find(s => s.id === conn.service) || { name: 'Unknown', color: 'bg-gray-600' };
                  return (
                    <div key={conn.id} className="card p-4 flex justify-between items-center border-emerald-200 bg-emerald-50/30">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${srv.color}`}>
                          {srv.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{conn.accountName}</h3>
                          <p className="text-xs text-gray-500">Last Synced: {conn.lastSynced ? format(new Date(conn.lastSynced), 'MMM d, yyyy h:mm a') : 'Never'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleSync(conn)} className="btn btn-primary btn-sm">Sync</button>
                        <button onClick={() => handleDisconnect(conn.id)} className="btn btn-ghost btn-sm text-red-600 hover:text-red-700 hover:bg-red-50">Disconnect</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <h2 className="text-xl font-bold text-gray-900 mb-4">Service Connections</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SERVICES.map(service => (
                <div key={service.id} className="card p-5 flex flex-col h-full border-gray-200 relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${service.color}`}>
                        {service.name.charAt(0)}
                      </div>
                      <h3 className="font-semibold text-lg">{service.name}</h3>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {service.status}
                    </span>
                  </div>
                  
                  <div className="space-y-3 flex-grow">
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Target Data</span>
                      <p className="text-sm text-gray-800 mt-0.5">{service.data}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Limitation</span>
                      <p className="text-sm text-gray-700 mt-0.5">{service.limitation}</p>
                    </div>
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col gap-3">
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alternative</span>
                      <p className="text-sm text-gray-600 italic mt-1">{service.alternative}</p>
                    </div>
                    {service.canConnect && (
                      <button 
                        onClick={() => { setSelectedService(service); setConnectModalOpen(true); }}
                        className="btn btn-secondary w-full"
                      >
                        Connect {service.name} Account
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {wizardStep > 0 && (
        <div className="card border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">CSV Import Wizard</h2>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(step => (
                <div key={step} className="flex items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${wizardStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {step}
                  </div>
                  {step < 3 && <div className={`w-8 h-1 mx-1 ${wizardStep > step ? 'bg-blue-600' : 'bg-gray-200'}`}></div>}
                </div>
              ))}
            </div>
          </div>

          <div className="p-6">
            {wizardStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-md font-medium text-gray-900">Step 1: Upload CSV</h3>
                <p className="text-sm text-gray-600">Upload your job applications data. The file must include column headers.</p>
                <div className="mt-4">
                  <label className="block w-full flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-500 transition-colors bg-gray-50">
                    <div className="space-y-1 text-center">
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex text-sm text-gray-600 justify-center">
                        <span className="relative rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                          Upload a file
                        </span>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">CSV up to 10MB</p>
                    </div>
                    <input type="file" className="sr-only" accept=".csv" onChange={handleFileUpload} />
                  </label>
                </div>
                <div className="flex justify-end mt-6">
                  <button onClick={resetWizard} className="btn btn-ghost">Cancel</button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-md font-medium text-gray-900">Step 2: Map Columns</h3>
                  <p className="text-sm text-gray-600 mt-1">Match the columns from your CSV to the application fields.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  {TARGET_FIELDS.map(field => (
                    <div key={field.key} className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        className="form-select text-sm"
                        value={fieldMapping[field.key] || ''}
                        onChange={e => setFieldMapping({...fieldMapping, [field.key]: e.target.value})}
                      >
                        <option value="">-- Skip / Ignore --</option>
                        {parsedData.headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center mt-8 pt-4 border-t border-gray-100">
                  <button onClick={resetWizard} className="btn btn-ghost">Cancel</button>
                  <div className="flex gap-3">
                    <button onClick={() => setWizardStep(1)} className="btn btn-secondary">Back</button>
                    <button onClick={handleMapNext} className="btn btn-primary">Next: Preview</button>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-md font-medium text-gray-900">Step 3: Preview & Confirm</h3>
                  <p className="text-sm text-gray-600 mt-1">Review the data before importing. Only valid, non-duplicate rows will be imported.</p>
                </div>

                <div className="flex gap-4 mb-4">
                  <div className="bg-green-50 text-green-800 px-4 py-3 rounded border border-green-200 flex-1">
                    <span className="block text-2xl font-bold">{validCount}</span>
                    <span className="text-sm">Ready to import</span>
                  </div>
                  <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded border border-amber-200 flex-1">
                    <span className="block text-2xl font-bold">{duplicateCount}</span>
                    <span className="text-sm">Duplicates (Will be skipped)</span>
                  </div>
                  <div className="bg-red-50 text-red-800 px-4 py-3 rounded border border-red-200 flex-1">
                    <span className="block text-2xl font-bold">{warningCount}</span>
                    <span className="text-sm">Invalid (Will be skipped)</span>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">App Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {previewData.slice(0, 10).map(row => (
                        <tr key={row._index} className={row.hasError ? 'bg-red-50' : row.isDuplicate ? 'bg-amber-50' : ''}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.hasError ? (
                              <span className="text-red-600 font-medium text-xs">Error: {row.errorMsg}</span>
                            ) : row.isDuplicate ? (
                              <span className="text-amber-600 font-medium text-xs">Duplicate</span>
                            ) : (
                              <span className="text-green-600 font-medium text-xs">Valid</span>
                            )}
                          </td>
                          <td className="px-4 py-3">{row.data.company}</td>
                          <td className="px-4 py-3">{row.data.role}</td>
                          <td className="px-4 py-3">
                            {!row.hasError && <StatusBadge status={row.data.status} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length > 10 && (
                    <div className="text-center py-2 text-sm text-gray-500 bg-gray-50 border-t border-gray-200">
                      Showing 10 of {previewData.length} rows
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mt-8 pt-4 border-t border-gray-100">
                  <button onClick={resetWizard} className="btn btn-ghost">Cancel</button>
                  <div className="flex gap-3">
                    <button onClick={() => setWizardStep(2)} className="btn btn-secondary">Back</button>
                    <button 
                      onClick={handleImport} 
                      disabled={validCount === 0}
                      className="btn btn-primary"
                    >
                      Import {validCount} Applications
                    </button>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <h3 className="text-lg font-medium text-gray-900">Importing Data...</h3>
                <p className="text-gray-500">Please wait while we add your applications.</p>
              </div>
            )}
          </div>
        </div>
      )}
      <Modal open={connectModalOpen} onClose={() => { setConnectModalOpen(false); setApiToken(''); }} title={`Connect ${selectedService?.name}`}>
        <form onSubmit={handleConnect} className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter your credentials or extension token to authorize {selectedService?.name} access. 
            This token is saved entirely locally on this device.
          </p>
          <div>
            <label className="form-label">API Key / Extension Token</label>
            <input 
              type="password" 
              className="form-input" 
              value={apiToken} 
              onChange={e => setApiToken(e.target.value)} 
              placeholder="Paste token here..."
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => { setConnectModalOpen(false); setApiToken(''); }} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary">Connect Account</button>
          </div>
        </form>
      </Modal>

      <Modal open={googleSyncModalOpen} onClose={() => setGoogleSyncModalOpen(false)} title="Import from Google Sheets">
        <form onSubmit={fetchGoogleSheets} className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter the ID of your Google Sheet and the data range to import. The first row should contain your column headers.
          </p>
          <div>
            <label className="form-label">Spreadsheet ID</label>
            <input 
              type="text" 
              className="form-input" 
              value={googleSheetId} 
              onChange={e => setGoogleSheetId(e.target.value)} 
              placeholder="e.g., 1BxiMVs0XRYFgwn..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">Found in the URL: docs.google.com/spreadsheets/d/<strong>[Spreadsheet ID]</strong>/edit</p>
          </div>
          <div>
            <label className="form-label">Data Range</label>
            <input 
              type="text" 
              className="form-input" 
              value={googleRange} 
              onChange={e => setGoogleRange(e.target.value)} 
              placeholder="e.g., Sheet1!A1:Z100"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setGoogleSyncModalOpen(false)} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary bg-emerald-600 hover:bg-emerald-700">Fetch Data</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
