import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO, isToday, isFuture, startOfToday, differenceInDays } from 'date-fns';
import { useApp } from '../App';
import { 
  db, 
  statusBadgeClass, 
  sourceBadgeClass, 
  createDashboard, 
  updateDashboard, 
  deleteDashboard,
  APP_STATUSES,
  APP_SOURCES,
  getInterviewWithRelations
} from '../db';
import { 
  Modal, 
  ConfirmDialog, 
  StatusBadge, 
  SourceBadge, 
  SampleBadge, 
  EmptyState, 
  PageHeader, 
  StatCard 
} from '../components/ui';

const SOURCE_COLORS = {
  'Referral': '#10b981', 
  'Recruiter Outreach': '#8b5cf6', 
  'Job Board': '#3b82f6', 
  'Company Site': '#6366f1', 
  'Cold Apply': '#6b7280', 
  'Imported': '#f97316'
};

const STATUS_COLORS = {
  'Wishlist': '#9ca3af',
  'Applied': '#60a5fa',
  'Phone Screen': '#c084fc',
  'Interviewing': '#818cf8',
  'Offer': '#34d399',
  'Rejected': '#f87171',
  'Withdrawn': '#fb923c'
};

const AVAILABLE_WIDGETS = [
  { id: 'statusSummary', label: 'Status Summary' },
  { id: 'sourceBreakdown', label: 'Source Breakdown' },
  { id: 'upcomingFollowUps', label: 'Upcoming Follow-ups' },
  { id: 'upcomingInterviews', label: 'Upcoming Interviews' },
  { id: 'recentActivity', label: 'Recent Activity' },
  { id: 'statusPipeline', label: 'Status Pipeline' },
];

export default function Dashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshKey, refresh, showToast } = useApp();

  const [dashboards, setDashboards] = useState([]);
  const [currentDashboard, setCurrentDashboard] = useState(null);
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    widgets: ['statusSummary', 'statusPipeline', 'sourceBreakdown', 'upcomingFollowUps', 'upcomingInterviews', 'recentActivity']
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedDashboards, loadedApps, loadedInterviewsRaw] = await Promise.all([
          db.dashboards.toArray(),
          db.applications.toArray(),
          db.interviews.toArray(),
        ]);
        
        // Fetch relations for interviews to get application details
        const loadedInterviews = await Promise.all(
          loadedInterviewsRaw.map(async (inv) => {
            return await getInterviewWithRelations(inv.id);
          })
        );

        setDashboards(loadedDashboards);
        setApplications(loadedApps);
        setInterviews(loadedInterviews);

        if (loadedDashboards.length > 0) {
          let target;
          if (id) {
            target = loadedDashboards.find(d => d.id.toString() === id);
          }
          if (!target) {
            target = loadedDashboards.find(d => d.isDefault) || loadedDashboards[0];
          }
          setCurrentDashboard(target);
          if (target && target.id.toString() !== id && id) {
             navigate(`/dashboard/${target.id}`, { replace: true });
          }
        } else {
          setCurrentDashboard(null);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    };
    loadData();
  }, [refreshKey, id, navigate]);

  // Derived Metrics
  const metrics = useMemo(() => {
    const activeApps = applications.filter(a => a.status !== 'Rejected' && a.status !== 'Withdrawn');
    const inactiveApps = applications.filter(a => a.status === 'Rejected' || a.status === 'Withdrawn');
    
    const byStatus = APP_STATUSES.reduce((acc, status) => {
      acc[status] = applications.filter(a => a.status === status).length;
      return acc;
    }, {});

    const sourceData = APP_SOURCES.map(source => ({
      name: source,
      value: applications.filter(a => a.source === source).length
    })).filter(d => d.value > 0);

    const pipelineData = APP_STATUSES.map(status => ({
      name: status,
      count: applications.filter(a => a.status === status).length,
      fill: STATUS_COLORS[status] || '#cbd5e1'
    }));

    const today = startOfToday();
    const upcomingFollowUps = activeApps
      .filter(a => a.followUpDate && (parseISO(a.followUpDate) >= today || isToday(parseISO(a.followUpDate))))
      .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
      .slice(0, 5);

    const upcomingInterviewsList = interviews
      .filter(i => i.status === 'Scheduled' && i.date && (parseISO(i.date) >= today || isToday(parseISO(i.date))))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);

    const recentActivityList = [...applications]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 10);

    return {
      activeCount: activeApps.length,
      inactiveCount: inactiveApps.length,
      byStatus,
      sourceData,
      pipelineData,
      upcomingFollowUps,
      upcomingInterviewsList,
      recentActivityList
    };
  }, [applications, interviews]);

  const handleOpenCreate = () => {
    setEditingDashboard(null);
    setFormData({
      name: '',
      description: '',
      widgets: ['statusSummary', 'statusPipeline', 'sourceBreakdown', 'upcomingFollowUps', 'upcomingInterviews', 'recentActivity']
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = () => {
    if (!currentDashboard) return;
    setEditingDashboard(currentDashboard);
    let parsedWidgets = [];
    try {
      parsedWidgets = typeof currentDashboard.widgets === 'string' ? JSON.parse(currentDashboard.widgets) : currentDashboard.widgets;
    } catch (e) {
      parsedWidgets = ['statusSummary'];
    }
    setFormData({
      name: currentDashboard.name,
      description: currentDashboard.description || '',
      widgets: parsedWidgets || []
    });
    setIsFormOpen(true);
  };

  const handleSaveDashboard = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    
    const payload = {
      name: formData.name,
      description: formData.description,
      widgets: JSON.stringify(formData.widgets)
    };

    try {
      if (editingDashboard) {
        await updateDashboard(editingDashboard.id, payload);
        showToast('Dashboard updated successfully', 'success');
      } else {
        const newId = await createDashboard({ ...payload, isDefault: 0, filters: JSON.stringify({}) });
        navigate(`/dashboard/${newId}`);
        showToast('Dashboard created successfully', 'success');
      }
      setIsFormOpen(false);
      refresh();
    } catch (err) {
      console.error(err);
      showToast('Error saving dashboard', 'error');
    }
  };

  const handleDeleteDashboard = async () => {
    if (!currentDashboard || currentDashboard.isDefault) return;
    try {
      await deleteDashboard(currentDashboard.id);
      showToast('Dashboard deleted', 'success');
      setIsDeleteConfirmOpen(false);
      navigate('/dashboard');
      refresh();
    } catch (err) {
      console.error(err);
      showToast('Error deleting dashboard', 'error');
    }
  };

  const toggleWidget = (widgetId) => {
    setFormData(prev => {
      const w = prev.widgets;
      if (w.includes(widgetId)) {
        return { ...prev, widgets: w.filter(id => id !== widgetId) };
      }
      return { ...prev, widgets: [...w, widgetId] };
    });
  };

  const renderWidget = (widgetId) => {
    switch (widgetId) {
      case 'statusSummary':
        return (
          <div key={widgetId} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard label="Active Applications" value={metrics.activeCount} color="blue" />
            <StatCard label="Applied" value={metrics.byStatus['Applied'] || 0} color="gray" />
            <StatCard label="Interviewing" value={(metrics.byStatus['Phone Screen'] || 0) + (metrics.byStatus['Interviewing'] || 0)} color="purple" />
            <StatCard label="Offers" value={metrics.byStatus['Offer'] || 0} color="green" />
            <StatCard label="Rejected / Withdrawn" value={metrics.inactiveCount} color="red" />
          </div>
        );
      
      case 'sourceBreakdown':
        return (
          <div key={widgetId} className="card p-4 h-96 flex flex-col">
            <h3 className="font-semibold text-lg mb-4 text-slate-800">Applications by Source</h3>
            {metrics.sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.sourceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {metrics.sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={SOURCE_COLORS[entry.name] || '#999'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No Source Data" message="Add applications to see source breakdown." />
            )}
          </div>
        );

      case 'statusPipeline':
        return (
          <div key={widgetId} className="card p-4 h-96 flex flex-col">
            <h3 className="font-semibold text-lg mb-4 text-slate-800">Pipeline Overview</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.pipelineData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {metrics.pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'upcomingFollowUps':
        return (
          <div key={widgetId} className="card p-4">
            <h3 className="font-semibold text-lg mb-4 text-slate-800">Upcoming Follow-ups</h3>
            {metrics.upcomingFollowUps.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {metrics.upcomingFollowUps.map(app => (
                  <li 
                    key={app.id} 
                    className="py-3 flex justify-between items-center hover:bg-slate-50 cursor-pointer rounded px-2"
                    onClick={() => navigate(`/applications/${app.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {app.role} {app.isSample && <SampleBadge />}
                      </p>
                      <p className="text-sm text-slate-500 truncate">{app.company}</p>
                      {app.nextAction && <p className="text-xs text-slate-400 truncate">Action: {app.nextAction}</p>}
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-sm text-slate-900">{format(parseISO(app.followUpDate), 'MMM d, yyyy')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No Follow-ups" message="You have no upcoming follow-ups scheduled." />
            )}
          </div>
        );

      case 'upcomingInterviews':
        return (
          <div key={widgetId} className="card p-4">
            <h3 className="font-semibold text-lg mb-4 text-slate-800">Upcoming Interviews</h3>
            {metrics.upcomingInterviewsList.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {metrics.upcomingInterviewsList.map(int => (
                  <li 
                    key={int.id} 
                    className="py-3 flex justify-between items-center hover:bg-slate-50 cursor-pointer rounded px-2"
                    onClick={() => navigate(`/interviews/${int.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {int.roundName} {int.isSample && <SampleBadge />}
                      </p>
                      <p className="text-sm text-slate-500 truncate">
                        {int.application?.company} - {int.type}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-sm text-slate-900">{format(parseISO(int.date), 'MMM d, yyyy h:mm a')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No Interviews" message="You have no upcoming interviews scheduled." />
            )}
          </div>
        );

      case 'recentActivity':
        return (
          <div key={widgetId} className="card p-4">
            <h3 className="font-semibold text-lg mb-4 text-slate-800">Recent Activity</h3>
            {metrics.recentActivityList.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {metrics.recentActivityList.map(app => (
                  <li 
                    key={app.id} 
                    className="py-3 flex justify-between items-center hover:bg-slate-50 cursor-pointer rounded px-2"
                    onClick={() => navigate(`/applications/${app.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {app.company} {app.isSample && <SampleBadge />}
                      </p>
                      <p className="text-sm text-slate-500 truncate">{app.role}</p>
                    </div>
                    <div className="ml-4 text-right flex flex-col items-end gap-1">
                      <StatusBadge status={app.status} />
                      <p className="text-xs text-slate-400">
                        {app.updatedAt ? format(new Date(app.updatedAt), 'MMM d') : format(new Date(app.createdAt), 'MMM d')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No Activity" message="No recent activity to show." />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  let activeWidgets = [];
  if (currentDashboard) {
    try {
      activeWidgets = typeof currentDashboard.widgets === 'string' ? JSON.parse(currentDashboard.widgets) : currentDashboard.widgets;
    } catch (e) {
      activeWidgets = [];
    }
  }

  // Layout configuration
  const fullWidthWidgets = ['statusSummary'];
  const gridWidgets = activeWidgets.filter(w => !fullWidthWidgets.includes(w));
  const fullWidgets = activeWidgets.filter(w => fullWidthWidgets.includes(w));

  return (
    <div className="pb-10">
      <PageHeader title={currentDashboard ? currentDashboard.name : 'Dashboard'}>
        <div className="flex items-center gap-3">
          <select 
            className="form-select text-sm py-1.5 min-w-[200px]"
            value={currentDashboard?.id || ''}
            onChange={(e) => navigate(`/dashboard/${e.target.value}`)}
          >
            {dashboards.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={handleOpenEdit} disabled={!currentDashboard}>
            Edit
          </button>
          {!currentDashboard?.isDefault && currentDashboard && (
            <button className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => setIsDeleteConfirmOpen(true)}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
            + New Dashboard
          </button>
        </div>
      </PageHeader>

      {currentDashboard && currentDashboard.description && (
        <p className="text-slate-500 mb-6 px-1">{currentDashboard.description}</p>
      )}

      {currentDashboard ? (
        <div className="space-y-6">
          {fullWidgets.map(renderWidget)}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {gridWidgets.map(renderWidget)}
          </div>
        </div>
      ) : (
        <EmptyState title="No Dashboards Found" message="Create a dashboard to get started." />
      )}

      {/* Create / Edit Modal */}
      <Modal 
        open={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingDashboard ? 'Edit Dashboard' : 'New Dashboard'}
      >
        <form onSubmit={handleSaveDashboard} className="space-y-4">
          <div>
            <label className="form-label">Name</label>
            <input 
              type="text" 
              className="form-input" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea 
              className="form-textarea" 
              rows="2"
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
          
          <div>
            <label className="form-label mb-2 block">Widgets</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AVAILABLE_WIDGETS.map(widget => (
                <label key={widget.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.widgets.includes(widget.id)}
                    onChange={() => toggleWidget(widget.id)}
                  />
                  <span className="text-sm text-slate-700">{widget.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setIsFormOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Dashboard</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteDashboard}
        title="Delete Dashboard"
        message="Are you sure you want to delete this dashboard? This action cannot be undone."
        danger={true}
        confirmLabel="Delete"
      />
    </div>
  );
}
