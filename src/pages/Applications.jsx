import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  db, APP_STATUSES, APP_SOURCES, PRIORITIES, 
  statusBadgeClass, sourceBadgeClass, priorityClass, 
  getApplicationWithRelations, createApplication, updateApplication, deleteApplication 
} from '../db';
import { 
  Modal, ConfirmDialog, StatusBadge, SourceBadge, SampleBadge, PriorityDot, 
  EmptyState, PageHeader, SearchInput, Tabs, DetailPanel, LinkPill, ContactChipSelect 
} from '../components/ui';
import { useApp } from '../App';
import { format, parseISO, isToday, isFuture } from 'date-fns';

export default function Applications() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshKey, refresh, showToast } = useApp();

  const [applications, setApplications] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active view tab
  const [activeTab, setActiveTab] = useState('board');
  
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [selectedContactIds, setSelectedContactIds] = useState([]);

  // Detail panel state
  const [selectedApp, setSelectedApp] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // List view filters and sorts
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [sortBy, setSortBy] = useState('dateApplied'); // 'company', 'dateApplied', 'followUpDate'

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const apps = await db.applications.toArray();
        const conts = await db.contacts.toArray();
        setApplications(apps);
        setContacts(conts);
      } catch (err) {
        showToast('Failed to load applications', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [refreshKey, showToast]);

  useEffect(() => {
    async function loadDetail() {
      if (!id) {
        setSelectedApp(null);
        return;
      }
      setIsDetailLoading(true);
      try {
        const appDetail = await getApplicationWithRelations(Number(id));
        if (appDetail) {
          setSelectedApp(appDetail);
        } else {
          showToast('Application not found', 'error');
          navigate('/applications');
        }
      } catch (err) {
        showToast('Failed to load application details', 'error');
      } finally {
        setIsDetailLoading(false);
      }
    }
    loadDetail();
  }, [id, refreshKey, navigate, showToast]);

  const followUpApps = useMemo(() => {
    return applications
      .filter(app => {
        if (app.status === 'Rejected' || app.status === 'Withdrawn') return false;
        if (!app.followUpDate) return false;
        const d = parseISO(app.followUpDate);
        return isToday(d) || isFuture(d);
      })
      .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
  }, [applications]);

  const listApps = useMemo(() => {
    let result = [...applications];
    
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(app => 
        app.company.toLowerCase().includes(lowerQ) || 
        app.role.toLowerCase().includes(lowerQ)
      );
    }
    
    if (filterStatus) {
      result = result.filter(app => app.status === filterStatus);
    }
    
    if (filterSource) {
      result = result.filter(app => app.source === filterSource);
    }

    result.sort((a, b) => {
      if (sortBy === 'company') {
        return a.company.localeCompare(b.company);
      } else if (sortBy === 'dateApplied') {
        return new Date(b.dateApplied || 0) - new Date(a.dateApplied || 0);
      } else if (sortBy === 'followUpDate') {
        if (!a.followUpDate) return 1;
        if (!b.followUpDate) return -1;
        return new Date(a.followUpDate) - new Date(b.followUpDate);
      }
      return 0;
    });
    
    return result;
  }, [applications, searchQuery, filterStatus, filterSource, sortBy]);

  const handleOpenCreateForm = () => {
    setEditingApp(null);
    setSelectedContactIds([]);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = () => {
    if (!selectedApp) return;
    setEditingApp(selectedApp);
    setSelectedContactIds(selectedApp.contacts.map(c => c.id));
    setIsFormOpen(true);
  };

  const handleSaveApp = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      company: formData.get('company'),
      role: formData.get('role'),
      status: formData.get('status'),
      source: formData.get('source'),
      dateApplied: formData.get('dateApplied') || null,
      jobPostingLink: formData.get('jobPostingLink'),
      targetCompensation: formData.get('targetCompensation'),
      priority: formData.get('priority'),
      followUpDate: formData.get('followUpDate') || null,
      nextAction: formData.get('nextAction'),
      notes: formData.get('notes'),
    };
    
    if (!data.company || !data.role) {
      showToast('Company and Role are required', 'error');
      return;
    }

    try {
      if (editingApp) {
        await updateApplication(editingApp.id, { ...data, contactIds: selectedContactIds });
        showToast('Application updated', 'success');
      } else {
        await createApplication({ ...data, contactIds: selectedContactIds });
        showToast('Application created', 'success');
      }
      setIsFormOpen(false);
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteApp = async () => {
    if (!selectedApp) return;
    try {
      await deleteApplication(selectedApp.id);
      showToast('Application deleted', 'success');
      setDeleteConfirmOpen(false);
      navigate('/applications');
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const renderBoard = () => (
    <div className="kanban-board overflow-x-auto flex-1 flex space-x-4 p-1">
      {APP_STATUSES.map(status => {
        const columnApps = applications.filter(a => a.status === status);
        return (
          <div key={status} className="kanban-column w-80 shrink-0 flex flex-col bg-slate-50 rounded-lg p-2 h-full">
            <div className="kanban-column-header mb-2 px-2 flex justify-between items-center text-sm font-semibold text-slate-700">
              {status}
              <span className="bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-xs">{columnApps.length}</span>
            </div>
            <div className="kanban-column-body flex-1 overflow-y-auto space-y-2 pb-2 scrollbar-thin">
              {columnApps.map(app => (
                <div 
                  key={app.id} 
                  className={`kanban-card card p-3 cursor-pointer hover:shadow-md transition-shadow relative border-l-4 ${priorityClass(app.priority)} bg-white`}
                  onClick={() => navigate(`/applications/${app.id}`)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-900 truncate pr-2" title={app.company}>{app.company}</h4>
                    {app.isSample && <SampleBadge />}
                  </div>
                  <p className="text-sm text-slate-600 mb-2 truncate" title={app.role}>{app.role}</p>
                  
                  <div className="flex justify-between items-center mt-2">
                    <SourceBadge source={app.source} />
                    {app.followUpDate && (
                      <span className="text-xs text-amber-600 font-medium">
                        Follow-up: {format(parseISO(app.followUpDate), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {columnApps.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-400">No applications</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderList = () => (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center bg-slate-50">
        <div className="w-64">
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search company or role..." />
        </div>
        <select className="form-select max-w-xs" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select max-w-xs" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="">All Sources</option>
          {APP_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="text-sm text-slate-500 ml-auto">{listApps.length} results</div>
      </div>
      
      <div className="overflow-auto flex-1">
        <table className="data-table w-full text-left border-collapse">
          <thead className="bg-white sticky top-0 shadow-sm">
            <tr>
              <th className="p-3 border-b cursor-pointer hover:bg-slate-50" onClick={() => setSortBy('company')}>Company {sortBy === 'company' && '↓'}</th>
              <th className="p-3 border-b">Role</th>
              <th className="p-3 border-b">Status</th>
              <th className="p-3 border-b">Source</th>
              <th className="p-3 border-b">Priority</th>
              <th className="p-3 border-b cursor-pointer hover:bg-slate-50" onClick={() => setSortBy('dateApplied')}>Date Applied {sortBy === 'dateApplied' && '↓'}</th>
              <th className="p-3 border-b cursor-pointer hover:bg-slate-50" onClick={() => setSortBy('followUpDate')}>Follow-Up {sortBy === 'followUpDate' && '↓'}</th>
            </tr>
          </thead>
          <tbody>
            {listApps.map(app => (
              <tr key={app.id} onClick={() => navigate(`/applications/${app.id}`)} className="border-b hover:bg-slate-50 cursor-pointer">
                <td className="p-3 font-medium">
                  {app.company} {app.isSample && <SampleBadge />}
                </td>
                <td className="p-3 text-slate-600">{app.role}</td>
                <td className="p-3"><StatusBadge status={app.status} /></td>
                <td className="p-3"><SourceBadge source={app.source} /></td>
                <td className="p-3"><PriorityDot priority={app.priority} /></td>
                <td className="p-3 text-slate-600">{app.dateApplied ? format(parseISO(app.dateApplied), 'MMM d, yyyy') : '-'}</td>
                <td className="p-3 text-slate-600">{app.followUpDate ? format(parseISO(app.followUpDate), 'MMM d, yyyy') : '-'}</td>
              </tr>
            ))}
            {listApps.length === 0 && (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500">No applications match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderFollowUp = () => (
    <div className="flex-1 overflow-auto">
      {followUpApps.length === 0 ? (
        <EmptyState 
          title="All caught up!" 
          message="No applications currently need follow-up." 
          icon={<div className="text-4xl">🎉</div>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {followUpApps.map(app => {
            const isUrgent = isToday(parseISO(app.followUpDate));
            return (
              <div 
                key={app.id} 
                className={`card p-4 cursor-pointer hover:shadow-md transition-all border-l-4 ${isUrgent ? 'border-red-500' : 'border-amber-400'}`}
                onClick={() => navigate(`/applications/${app.id}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg">{app.company}</h3>
                  <div className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">
                    {format(parseISO(app.followUpDate), 'MMM d')}
                    {isUrgent && <span className="ml-1 text-red-500">(Today)</span>}
                  </div>
                </div>
                <p className="text-slate-600 mb-3">{app.role}</p>
                <div className="mb-3"><StatusBadge status={app.status} /></div>
                {app.nextAction && (
                  <div className="bg-slate-50 p-2 rounded text-sm text-slate-700 border border-slate-100">
                    <span className="font-semibold">Next Action:</span> {app.nextAction}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="p-8 text-center">Loading applications...</div>;
  }

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in p-4">
      <PageHeader title="Applications">
        <button className="btn btn-primary" onClick={handleOpenCreateForm}>+ Add Application</button>
      </PageHeader>

      <Tabs 
        tabs={[
          { key: 'board', label: 'Board' },
          { key: 'list', label: 'List' },
          { key: 'followup', label: 'Follow-Up', count: followUpApps.length }
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'board' && renderBoard()}
        {activeTab === 'list' && renderList()}
        {activeTab === 'followup' && renderFollowUp()}
      </div>

      <DetailPanel 
        open={!!id} 
        onClose={() => navigate('/applications')}
        title={isDetailLoading ? 'Loading...' : selectedApp?.company || 'Application Details'}
      >
        {isDetailLoading ? (
          <div className="p-4 text-center">Loading details...</div>
        ) : selectedApp ? (
          <div className="p-6 space-y-8">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  {selectedApp.company}
                  {selectedApp.isSample && <SampleBadge />}
                </h2>
                <p className="text-lg text-slate-600 mt-1">{selectedApp.role}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={handleOpenEditForm}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmOpen(true)}>Delete</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500 font-medium">Status</p>
                <div className="mt-1"><StatusBadge status={selectedApp.status} /></div>
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Priority</p>
                <div className="mt-1"><PriorityDot priority={selectedApp.priority} /></div>
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Source</p>
                <div className="mt-1"><SourceBadge source={selectedApp.source} /></div>
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Target Comp</p>
                <p className="mt-1 text-slate-900">{selectedApp.targetCompensation || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Date Applied</p>
                <p className="mt-1 text-slate-900">{selectedApp.dateApplied ? format(parseISO(selectedApp.dateApplied), 'PPP') : '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Follow-Up Date</p>
                <p className="mt-1 text-slate-900">{selectedApp.followUpDate ? format(parseISO(selectedApp.followUpDate), 'PPP') : '-'}</p>
              </div>
            </div>

            {selectedApp.jobPostingLink && (
              <div>
                <p className="text-sm text-slate-500 font-medium mb-1">Job Posting</p>
                <a href={selectedApp.jobPostingLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                  {selectedApp.jobPostingLink}
                </a>
              </div>
            )}

            {selectedApp.nextAction && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <p className="text-sm text-amber-800 font-bold mb-1">Next Action</p>
                <p className="text-amber-900">{selectedApp.nextAction}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-slate-500 font-medium mb-2">Notes</p>
              <div className="bg-slate-50 p-4 rounded-lg whitespace-pre-wrap text-sm text-slate-800 border border-slate-100 min-h-[100px]">
                {selectedApp.notes || 'No notes.'}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-slate-500 font-medium">Linked Contacts</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedApp.contacts?.length > 0 ? (
                  selectedApp.contacts.map(c => (
                    <LinkPill key={c.id} onClick={() => navigate(`/contacts/${c.id}`)}>
                      {c.name} ({c.roleType})
                    </LinkPill>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No contacts linked.</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-slate-500 font-medium">Interviews</p>
              </div>
              <div className="space-y-2">
                {selectedApp.interviews?.length > 0 ? (
                  selectedApp.interviews.map(inv => (
                    <div 
                      key={inv.id} 
                      className="flex justify-between items-center p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/interviews/${inv.id}`)}
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{inv.roundName}</p>
                        <p className="text-xs text-slate-500">{inv.date ? format(parseISO(inv.date), 'PPP') : 'No date'}</p>
                      </div>
                      <StatusBadge status={inv.status} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No interviews recorded.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DetailPanel>

      <Modal 
        open={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingApp ? "Edit Application" : "New Application"}
        wide
      >
        <form onSubmit={handleSaveApp} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Company *</label>
              <input type="text" name="company" className="form-input" required defaultValue={editingApp?.company || ''} />
            </div>
            <div>
              <label className="form-label">Role *</label>
              <input type="text" name="role" className="form-input" required defaultValue={editingApp?.role || ''} />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select name="status" className="form-select" defaultValue={editingApp?.status || 'Wishlist'}>
                {APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select name="priority" className="form-select" defaultValue={editingApp?.priority || 'Medium'}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Source</label>
              <select name="source" className="form-select" defaultValue={editingApp?.source || 'Job Board'}>
                {APP_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Date Applied</label>
              <input type="date" name="dateApplied" className="form-input" defaultValue={editingApp?.dateApplied || ''} />
            </div>
            <div>
              <label className="form-label">Follow-Up Date</label>
              <input type="date" name="followUpDate" className="form-input" defaultValue={editingApp?.followUpDate || ''} />
            </div>
            <div>
              <label className="form-label">Target Comp</label>
              <input type="text" name="targetCompensation" className="form-input" defaultValue={editingApp?.targetCompensation || ''} placeholder="e.g. $120k" />
            </div>
          </div>

          <div>
            <label className="form-label">Job Posting Link</label>
            <input type="url" name="jobPostingLink" className="form-input" defaultValue={editingApp?.jobPostingLink || ''} />
          </div>

          <div>
            <label className="form-label">Next Action</label>
            <input type="text" name="nextAction" className="form-input" defaultValue={editingApp?.nextAction || ''} placeholder="e.g. Send thank you email" />
          </div>

          <div>
            <label className="form-label">Linked Contacts</label>
            <ContactChipSelect 
              contacts={contacts} 
              selectedIds={selectedContactIds} 
              onChange={setSelectedContactIds} 
            />
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea name="notes" className="form-textarea h-24" defaultValue={editingApp?.notes || ''}></textarea>
          </div>

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-200">
            <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Application</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteApp}
        title="Delete Application"
        message={`Are you sure you want to delete the application for ${selectedApp?.company}? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
