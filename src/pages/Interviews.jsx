import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { 
  db, 
  INTERVIEW_TYPES, 
  INTERVIEW_STATUSES, 
  getInterviewWithRelations,
  createInterview,
  updateInterview,
  deleteInterview
} from '../db';
import { 
  Modal, 
  ConfirmDialog, 
  SampleBadge, 
  EmptyState, 
  PageHeader, 
  SearchInput, 
  DetailPanel, 
  LinkPill,
  Tabs,
  StatusBadge,
  ContactChipSelect
} from '../components/ui';
import { format, parseISO, isFuture, isToday } from 'date-fns';

export default function Interviews() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshKey, refresh, showToast } = useApp();

  const [interviews, setInterviews] = useState([]);
  const [applications, setApplications] = useState([]);
  const [contacts, setContacts] = useState([]);
  
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' or 'all'
  const [search, setSearch] = useState('');

  // Detail view
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState(null);
  const [formData, setFormData] = useState({
    applicationId: '',
    roundName: '',
    date: '',
    type: INTERVIEW_TYPES[0],
    status: INTERVIEW_STATUSES[0],
    prepNotes: '',
    questionsAsked: '',
    reflection: '',
    contactIds: []
  });

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const ivs = await db.interviews.toArray();
      const apps = await db.applications.toArray();
      const conts = await db.contacts.toArray();
      
      const appMap = new Map(apps.map(a => [a.id, a]));
      
      const enrichedIvs = ivs.map(iv => ({
        ...iv,
        application: appMap.get(iv.applicationId) || null
      }));
      
      setInterviews(enrichedIvs);
      setApplications(apps.sort((a,b) => a.company.localeCompare(b.company)));
      setContacts(conts.sort((a,b) => a.name.localeCompare(b.name)));
    };
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    const loadSelected = async () => {
      if (id) {
        setIsDetailLoading(true);
        try {
          const iv = await getInterviewWithRelations(Number(id));
          if (iv) {
            setSelectedInterview(iv);
          } else {
            navigate('/interviews');
            showToast('Interview not found', 'error');
          }
        } catch (error) {
          console.error(error);
          showToast('Failed to load interview', 'error');
        } finally {
          setIsDetailLoading(false);
        }
      } else {
        setSelectedInterview(null);
      }
    };
    loadSelected();
  }, [id, refreshKey, navigate, showToast]);

  const filteredInterviews = useMemo(() => {
    return interviews.filter(iv => {
      const matchSearch = search ? (
        iv.roundName.toLowerCase().includes(search.toLowerCase()) ||
        (iv.application && iv.application.company.toLowerCase().includes(search.toLowerCase()))
      ) : true;
      
      if (!matchSearch) return false;

      if (activeTab === 'upcoming') {
        const isScheduled = iv.status === 'Scheduled';
        let isUpcomingDate = true;
        if (iv.date) {
          const dateObj = parseISO(iv.date);
          isUpcomingDate = isFuture(dateObj) || isToday(dateObj);
        }
        return isScheduled && isUpcomingDate;
      }
      return true; // 'all'
    }).sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      if (activeTab === 'upcoming') {
        return a.date.localeCompare(b.date); // asc
      } else {
        return b.date.localeCompare(a.date); // desc
      }
    });
  }, [interviews, search, activeTab]);

  const handleOpenForm = (iv = null) => {
    if (iv) {
      setEditingInterviewId(iv.id);
      setFormData({
        applicationId: iv.applicationId || '',
        roundName: iv.roundName,
        date: iv.date ? iv.date.slice(0, 16) : '',
        type: iv.type || INTERVIEW_TYPES[0],
        status: iv.status || INTERVIEW_STATUSES[0],
        prepNotes: iv.prepNotes || '',
        questionsAsked: iv.questionsAsked || '',
        reflection: iv.reflection || '',
        contactIds: iv.contacts ? iv.contacts.map(c => c.id) : []
      });
    } else {
      setEditingInterviewId(null);
      setFormData({
        applicationId: applications.length > 0 ? applications[0].id : '',
        roundName: '',
        date: '',
        type: INTERVIEW_TYPES[0],
        status: INTERVIEW_STATUSES[0],
        prepNotes: '',
        questionsAsked: '',
        reflection: '',
        contactIds: []
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingInterviewId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        applicationId: formData.applicationId ? Number(formData.applicationId) : null
      };

      if (editingInterviewId) {
        await updateInterview(editingInterviewId, payload);
        showToast('Interview updated', 'success');
      } else {
        await createInterview(payload);
        showToast('Interview created', 'success');
      }
      handleCloseForm();
      refresh();
    } catch (err) {
      showToast('Error saving interview', 'error');
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!selectedInterview) return;
    try {
      await deleteInterview(selectedInterview.id);
      showToast('Interview deleted', 'success');
      setIsDeleteConfirmOpen(false);
      navigate('/interviews');
      refresh();
    } catch (err) {
      showToast('Error deleting interview', 'error');
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Interviews" subtitle="Track your scheduled and past interviews">
        <button onClick={() => handleOpenForm()} className="btn btn-primary">
          + Add Interview
        </button>
      </PageHeader>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <Tabs 
          tabs={[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'all', label: 'All Interviews' }
          ]} 
          active={activeTab}
          onChange={setActiveTab}
        />
        <div className="w-full md:w-64">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by round or company..." />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredInterviews.length === 0 ? (
          <EmptyState 
            title={activeTab === 'upcoming' ? "No upcoming interviews" : "No interviews found"} 
            message={search ? "Try a different search." : "Add an interview to start tracking your progress."}
            action={!search && <button onClick={() => handleOpenForm()} className="btn btn-primary mt-4">+ Add Interview</button>}
          />
        ) : (
          <div className="space-y-3">
            {filteredInterviews.map(iv => (
              <div 
                key={iv.id} 
                className="card cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row md:items-center justify-between p-4"
                onClick={() => navigate(`/interviews/${iv.id}`)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">{iv.roundName}</h3>
                    {iv.isSample && <SampleBadge />}
                  </div>
                  <div className="text-gray-600">
                    {iv.application ? `${iv.application.company} — ${iv.application.role}` : 'No Application Linked'}
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 mt-3 md:mt-0 md:ml-4 text-sm">
                  <div className="flex flex-col md:items-end">
                    <span className="font-medium text-gray-800">
                      {iv.date ? format(parseISO(iv.date), 'MMM d, yyyy h:mm a') : 'No Date'}
                    </span>
                    <span className="text-gray-500">{iv.type}</span>
                  </div>
                  <StatusBadge status={iv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DetailPanel 
        open={!!id} 
        onClose={() => navigate('/interviews')}
        title={selectedInterview ? `${selectedInterview.roundName}` : 'Loading...'}
      >
        {isDetailLoading || !selectedInterview ? (
          <div className="p-4 text-gray-500">Loading...</div>
        ) : (
          <div className="p-4 space-y-6">
            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status={selectedInterview.status} />
              <span className="badge bg-purple-100 text-purple-800">{selectedInterview.type}</span>
              {selectedInterview.isSample && <SampleBadge />}
            </div>

            <div className="grid grid-cols-2 gap-4 border-b pb-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Date &amp; Time</h4>
                <div className="font-medium">
                  {selectedInterview.date ? format(parseISO(selectedInterview.date), 'MMMM d, yyyy h:mm a') : 'Not scheduled'}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Application</h4>
                {selectedInterview.application ? (
                  <div className="mt-1">
                    <LinkPill onClick={() => navigate(`/applications/${selectedInterview.applicationId}`)}>
                      {selectedInterview.application.company}
                    </LinkPill>
                  </div>
                ) : (
                  <div className="text-gray-500">None</div>
                )}
              </div>
            </div>

            {selectedInterview.contacts && selectedInterview.contacts.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold mb-2">Interviewers</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedInterview.contacts.map(c => (
                    <LinkPill key={c.id} onClick={() => navigate(`/contacts/${c.id}`)}>
                      {c.name} ({c.roleType})
                    </LinkPill>
                  ))}
                </div>
              </div>
            )}

            {selectedInterview.prepNotes && (
              <div>
                <h4 className="text-lg font-semibold mb-2">Preparation Notes</h4>
                <div className="bg-gray-50 p-3 rounded-lg text-gray-800 whitespace-pre-wrap">
                  {selectedInterview.prepNotes}
                </div>
              </div>
            )}

            {selectedInterview.questionsAsked && (
              <div>
                <h4 className="text-lg font-semibold mb-2">Questions Asked</h4>
                <div className="bg-gray-50 p-3 rounded-lg text-gray-800 whitespace-pre-wrap">
                  {selectedInterview.questionsAsked}
                </div>
              </div>
            )}

            {selectedInterview.reflection && (
              <div>
                <h4 className="text-lg font-semibold mb-2">Post-Interview Reflection</h4>
                <div className="bg-gray-50 p-3 rounded-lg text-gray-800 whitespace-pre-wrap">
                  {selectedInterview.reflection}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 mt-6 border-t">
              <button className="btn btn-secondary flex-1" onClick={() => handleOpenForm(selectedInterview)}>
                Edit Interview
              </button>
              <button className="btn btn-danger flex-1" onClick={() => setIsDeleteConfirmOpen(true)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </DetailPanel>

      <Modal open={isFormOpen} onClose={handleCloseForm} title={editingInterviewId ? "Edit Interview" : "Add Interview"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Application</label>
            <select 
              className="form-select w-full"
              value={formData.applicationId}
              onChange={e => setFormData({...formData, applicationId: e.target.value})}
            >
              <option value="">-- No Application Linked --</option>
              {applications.map(app => (
                <option key={app.id} value={app.id}>{app.company} — {app.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Round Name *</label>
            <input 
              type="text" 
              required 
              className="form-input w-full" 
              value={formData.roundName}
              onChange={e => setFormData({...formData, roundName: e.target.value})}
              placeholder="e.g. Recruiter Screen, Technical Onsite"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Date &amp; Time</label>
              <input 
                type="datetime-local" 
                className="form-input w-full" 
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select 
                className="form-select w-full"
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                {INTERVIEW_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Status</label>
            <select 
              className="form-select w-full"
              value={formData.status}
              onChange={e => setFormData({...formData, status: e.target.value})}
            >
              {INTERVIEW_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Interviewers / Contacts</label>
            <ContactChipSelect 
              contacts={contacts}
              selectedIds={formData.contactIds}
              onChange={(newIds) => setFormData({...formData, contactIds: newIds})}
            />
          </div>

          <div>
            <label className="form-label">Prep Notes</label>
            <textarea 
              className="form-textarea w-full" 
              rows={2}
              value={formData.prepNotes}
              onChange={e => setFormData({...formData, prepNotes: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">Questions Asked</label>
            <textarea 
              className="form-textarea w-full" 
              rows={2}
              value={formData.questionsAsked}
              onChange={e => setFormData({...formData, questionsAsked: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">Reflection</label>
            <textarea 
              className="form-textarea w-full" 
              rows={2}
              value={formData.reflection}
              onChange={e => setFormData({...formData, reflection: e.target.value})}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" className="btn btn-secondary" onClick={handleCloseForm}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Interview</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Interview"
        message={`Are you sure you want to delete this interview (${selectedInterview?.roundName})? This action cannot be undone.`}
        confirmLabel="Delete"
        danger={true}
      />
    </div>
  );
}
