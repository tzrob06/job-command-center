import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { 
  db, 
  CONTACT_ROLES, 
  getContactWithRelations, 
  createContact, 
  updateContact, 
  deleteContact
} from '../db';
import { 
  Modal, 
  ConfirmDialog, 
  SampleBadge, 
  EmptyState, 
  PageHeader, 
  SearchInput, 
  DetailPanel, 
  StatusBadge
} from '../components/ui';

export default function Contacts() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshKey, refresh, showToast } = useApp();

  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Detail view state
  const [selectedContact, setSelectedContact] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    roleType: CONTACT_ROLES[0],
    email: '',
    linkedinUrl: '',
    notes: ''
  });

  // Delete confirm state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Load contacts list
  useEffect(() => {
    const loadContacts = async () => {
      const allContacts = await db.contacts.toArray();
      allContacts.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(allContacts);
    };
    loadContacts();
  }, [refreshKey]);

  // Load selected contact
  useEffect(() => {
    const loadSelected = async () => {
      if (id) {
        setIsDetailLoading(true);
        try {
          const contact = await getContactWithRelations(Number(id));
          if (contact) {
            setSelectedContact(contact);
          } else {
            navigate('/contacts');
            showToast('Contact not found', 'error');
          }
        } catch (error) {
          console.error(error);
          showToast('Failed to load contact', 'error');
        } finally {
          setIsDetailLoading(false);
        }
      } else {
        setSelectedContact(null);
      }
    };
    loadSelected();
  }, [id, refreshKey, navigate, showToast]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                            (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
      const matchesRole = roleFilter ? c.roleType === roleFilter : true;
      return matchesSearch && matchesRole;
    });
  }, [contacts, search, roleFilter]);

  const handleOpenForm = (contact = null) => {
    if (contact) {
      setEditingContactId(contact.id);
      setFormData({
        name: contact.name,
        roleType: contact.roleType,
        email: contact.email || '',
        linkedinUrl: contact.linkedinUrl || '',
        notes: contact.notes || ''
      });
    } else {
      setEditingContactId(null);
      setFormData({
        name: '',
        roleType: CONTACT_ROLES[0],
        email: '',
        linkedinUrl: '',
        notes: ''
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingContactId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingContactId) {
        await updateContact(editingContactId, formData);
        showToast('Contact updated', 'success');
      } else {
        await createContact(formData);
        showToast('Contact created', 'success');
      }
      handleCloseForm();
      refresh();
    } catch (err) {
      showToast('Error saving contact', 'error');
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!selectedContact) return;
    try {
      await deleteContact(selectedContact.id);
      showToast('Contact deleted', 'success');
      setIsDeleteConfirmOpen(false);
      navigate('/contacts');
      refresh();
    } catch (err) {
      showToast('Error deleting contact', 'error');
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Contacts" subtitle={`Manage your professional network (${contacts.length})`}>
        <button onClick={() => handleOpenForm()} className="btn btn-primary">
          + Add Contact
        </button>
      </PageHeader>

      <div className="flex gap-4 mb-4">
        <div className="w-64">
          <SearchInput value={search} onChange={setSearch} placeholder="Search contacts..." />
        </div>
        <select 
          className="form-select w-48"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {CONTACT_ROLES.map(role => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredContacts.length === 0 ? (
          <EmptyState 
            title="No contacts found" 
            message={contacts.length === 0 ? "You haven't added any contacts yet." : "Try adjusting your search or filters."}
            action={contacts.length === 0 ? <button onClick={() => handleOpenForm()} className="btn btn-primary mt-4">+ Add Contact</button> : null}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map(contact => (
              <div 
                key={contact.id} 
                className="card cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/contacts/${contact.id}`)}
              >
                <div className="card-body">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      {contact.name}
                      {contact.isSample && <SampleBadge />}
                    </h3>
                    <span className="badge bg-blue-100 text-blue-800 text-xs">{contact.roleType}</span>
                  </div>
                  {contact.email && (
                    <div className="text-sm text-gray-600 mb-1 truncate">
                      {contact.email}
                    </div>
                  )}
                  {contact.linkedinUrl && (
                    <div className="text-sm text-blue-600 mb-1 truncate">
                      <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        LinkedIn Profile
                      </a>
                    </div>
                  )}
                  {contact.notes && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                      {contact.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DetailPanel 
        open={!!id} 
        onClose={() => navigate('/contacts')}
        title={selectedContact ? selectedContact.name : 'Loading...'}
      >
        {isDetailLoading || !selectedContact ? (
          <div className="p-4 text-gray-500">Loading...</div>
        ) : (
          <div className="p-4 space-y-6">
            <div className="flex gap-2">
              <span className="badge bg-blue-100 text-blue-800">{selectedContact.roleType}</span>
              {selectedContact.isSample && <SampleBadge />}
            </div>

            <div className="space-y-3">
              {selectedContact.email && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Email</h4>
                  <a href={`mailto:${selectedContact.email}`} className="text-blue-600 hover:underline">{selectedContact.email}</a>
                </div>
              )}
              {selectedContact.linkedinUrl && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500">LinkedIn</h4>
                  <a href={selectedContact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {selectedContact.linkedinUrl}
                  </a>
                </div>
              )}
              {selectedContact.notes && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Notes</h4>
                  <p className="whitespace-pre-wrap text-gray-700">{selectedContact.notes}</p>
                </div>
              )}
            </div>

            {selectedContact.applications && selectedContact.applications.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold mb-3 border-b pb-2">Linked Applications</h4>
                <div className="space-y-2">
                  {selectedContact.applications.map(app => (
                    <div 
                      key={app.id}
                      className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                      onClick={() => navigate(`/applications/${app.id}`)}
                    >
                      <div>
                        <div className="font-medium">{app.company}</div>
                        <div className="text-sm text-gray-600">{app.role}</div>
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedContact.interviews && selectedContact.interviews.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold mb-3 border-b pb-2">Linked Interviews</h4>
                <div className="space-y-2">
                  {selectedContact.interviews.map(iv => (
                    <div 
                      key={iv.id}
                      className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                      onClick={() => navigate(`/interviews/${iv.id}`)}
                    >
                      <div>
                        <div className="font-medium">{iv.roundName}</div>
                        <div className="text-sm text-gray-600">{iv.application?.company}</div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {iv.date ? new Date(iv.date).toLocaleDateString() : 'No date'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 mt-6 border-t">
              <button className="btn btn-secondary flex-1" onClick={() => handleOpenForm(selectedContact)}>
                Edit Contact
              </button>
              <button className="btn btn-danger flex-1" onClick={() => setIsDeleteConfirmOpen(true)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </DetailPanel>

      <Modal open={isFormOpen} onClose={handleCloseForm} title={editingContactId ? "Edit Contact" : "Add Contact"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Name *</label>
            <input 
              type="text" 
              required 
              className="form-input w-full" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select 
              className="form-select w-full"
              value={formData.roleType}
              onChange={e => setFormData({...formData, roleType: e.target.value})}
            >
              {CONTACT_ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Email</label>
            <input 
              type="email" 
              className="form-input w-full" 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">LinkedIn URL</label>
            <input 
              type="url" 
              className="form-input w-full" 
              value={formData.linkedinUrl}
              onChange={e => setFormData({...formData, linkedinUrl: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea 
              className="form-textarea w-full" 
              rows={4}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" className="btn btn-secondary" onClick={handleCloseForm}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Contact</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Contact"
        message={`Are you sure you want to delete ${selectedContact?.name}? This will not delete any linked applications or interviews, but the link will be removed.`}
        confirmLabel="Delete"
        danger={true}
      />
    </div>
  );
}
