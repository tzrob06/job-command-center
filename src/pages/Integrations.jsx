import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { db, createApplication, APP_STATUSES, APP_SOURCES, PRIORITIES } from '../db';
import { PageHeader, StatusBadge } from '../components/ui';
import { useApp } from '../App';

const SERVICES = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    status: 'Manual Import Only',
    color: 'bg-blue-600',
    data: 'Job Applications, Connections',
    permissions: 'None (No API)',
    limitation: 'LinkedIn does not offer a public API for job application data. Direct integration is not possible without violating their terms of service.',
    alternative: "Export your data manually from LinkedIn (Settings > Data Privacy > Get a copy of your data > select 'Jobs' and 'Connections'), then use the CSV import wizard below."
  },
  {
    id: 'hiringcafe',
    name: 'HiringCafe',
    status: 'Manual Import Only',
    color: 'bg-green-600',
    data: 'Job Applications',
    permissions: 'None (No API)',
    limitation: 'HiringCafe does not currently provide a public API or OAuth integration for third-party apps.',
    alternative: 'If available, export your application data from HiringCafe as a CSV file and use the import wizard.'
  },
  {
    id: 'handshake',
    name: 'Handshake',
    status: 'Manual Import Only',
    color: 'bg-red-600',
    data: 'Job Applications, Employers',
    permissions: 'None (Restricted API)',
    limitation: "Handshake's API is restricted entirely to institutional partners (universities) and employer partners. Student data cannot be accessed by third-party apps.",
    alternative: 'Export your application data from your Handshake account (if your university allows it) and import via CSV.'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    status: 'Advanced Setup Required',
    color: 'bg-purple-600',
    data: 'Email contents (for auto-extracting status updates)',
    permissions: 'Read-only Mail (OAuth 2.0)',
    limitation: 'Since Job Command Center runs entirely locally without a backend, direct Gmail integration would require you to set up your own Google Cloud project with the Gmail API enabled and configure OAuth consent screens.',
    alternative: 'For now, export relevant emails as .eml or use Google Takeout, then manually enter the data. A local-only OAuth flow may be added in the future for advanced users.'
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
  
  useEffect(() => {
    // Load existing apps to check duplicates
    const loadApps = async () => {
      const apps = await db.applications.toArray();
      setExistingApps(apps);
    };
    if (wizardStep > 0) {
      loadApps();
    }
  }, [wizardStep]);

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
            <h2 className="text-xl font-bold text-gray-900 mb-4">Service Connections</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SERVICES.map(service => (
                <div key={service.id} className="card p-5 flex flex-col h-full border-gray-200">
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
                  
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alternative</span>
                    <p className="text-sm text-gray-600 italic mt-1">{service.alternative}</p>
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
    </div>
  );
}
