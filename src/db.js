/* ═══════════════════════════════════════════════════════════════════════════
   db.js — Dexie (IndexedDB) database: schema, constants, helpers, sample data
   ═══════════════════════════════════════════════════════════════════════════ */
import Dexie from 'dexie';

// ── Database ──────────────────────────────────────────────────────────────────
export const db = new Dexie('JobCommandCenter');

db.version(1).stores({
  applications:
    '++id, company, role, status, source, dateApplied, followUpDate, priority, isSample, updatedAt',
  contacts:
    '++id, name, roleType, email, isSample, updatedAt',
  interviews:
    '++id, applicationId, date, status, type, isSample, updatedAt',
  applicationContacts:
    '++id, applicationId, contactId, [applicationId+contactId]',
  interviewContacts:
    '++id, interviewId, contactId, [interviewId+contactId]',
  dashboards:
    '++id, name, isDefault',
  integrations:
    '++id, service, status',
});

// ── Enums / Options ──────────────────────────────────────────────────────────
export const APP_STATUSES = [
  'Wishlist', 'Applied', 'Phone Screen', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn',
];

export const APP_SOURCES = [
  'Referral', 'Recruiter Outreach', 'Job Board', 'Company Site', 'Cold Apply', 'Imported',
];

export const CONTACT_ROLES = [
  'Recruiter', 'Hiring Manager', 'Referral', 'Employee', 'Other',
];

export const INTERVIEW_TYPES = [
  'Phone', 'Video', 'On-site', 'Technical', 'Behavioral', 'Panel', 'Take-Home', 'Other',
];

export const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];

export const PRIORITIES = ['High', 'Medium', 'Low'];

// ── Status colours (CSS class suffix mapping) ────────────────────────────────
export function statusBadgeClass(status) {
  const map = {
    Wishlist:       'badge-wishlist',
    Applied:        'badge-applied',
    'Phone Screen': 'badge-phone-screen',
    Interviewing:   'badge-interviewing',
    Offer:          'badge-offer',
    Rejected:       'badge-rejected',
    Withdrawn:      'badge-withdrawn',
    Scheduled:      'badge-scheduled',
    Completed:      'badge-completed',
    Cancelled:      'badge-cancelled',
  };
  return map[status] || 'badge-wishlist';
}

export function sourceBadgeClass(source) {
  const map = {
    Referral:              'badge-referral',
    'Recruiter Outreach':  'badge-recruiter-outreach',
    'Job Board':           'badge-job-board',
    'Company Site':        'badge-company-site',
    'Cold Apply':          'badge-cold-apply',
    Imported:              'badge-imported',
  };
  return map[source] || 'badge-imported';
}

export function priorityClass(priority) {
  const map = { High: 'priority-high', Medium: 'priority-medium', Low: 'priority-low' };
  return map[priority] || '';
}

// ── Relationship Helpers ─────────────────────────────────────────────────────
export async function getApplicationWithRelations(id) {
  const app = await db.applications.get(Number(id));
  if (!app) return null;

  const acLinks = await db.applicationContacts.where('applicationId').equals(app.id).toArray();
  const contacts = acLinks.length
    ? await db.contacts.where('id').anyOf(acLinks.map((l) => l.contactId)).toArray()
    : [];

  const interviews = await db.interviews.where('applicationId').equals(app.id).toArray();

  // For each interview, also load its contacts
  for (const iv of interviews) {
    const icLinks = await db.interviewContacts.where('interviewId').equals(iv.id).toArray();
    iv.contacts = icLinks.length
      ? await db.contacts.where('id').anyOf(icLinks.map((l) => l.contactId)).toArray()
      : [];
  }

  return { ...app, contacts, interviews };
}

export async function getContactWithRelations(id) {
  const contact = await db.contacts.get(Number(id));
  if (!contact) return null;

  const acLinks = await db.applicationContacts.where('contactId').equals(contact.id).toArray();
  const applications = acLinks.length
    ? await db.applications.where('id').anyOf(acLinks.map((l) => l.applicationId)).toArray()
    : [];

  const icLinks = await db.interviewContacts.where('contactId').equals(contact.id).toArray();
  const interviews = icLinks.length
    ? await db.interviews.where('id').anyOf(icLinks.map((l) => l.interviewId)).toArray()
    : [];

  return { ...contact, applications, interviews };
}

export async function getInterviewWithRelations(id) {
  const iv = await db.interviews.get(Number(id));
  if (!iv) return null;

  const app = iv.applicationId ? await db.applications.get(iv.applicationId) : null;

  const icLinks = await db.interviewContacts.where('interviewId').equals(iv.id).toArray();
  const contacts = icLinks.length
    ? await db.contacts.where('id').anyOf(icLinks.map((l) => l.contactId)).toArray()
    : [];

  return { ...iv, application: app, contacts };
}

// ── CRUD helpers ─────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();

export async function createApplication(data) {
  const { contactIds = [], ...fields } = data;
  const id = await db.applications.add({ ...fields, isSample: 0, createdAt: now(), updatedAt: now() });
  for (const cid of contactIds) {
    await db.applicationContacts.add({ applicationId: id, contactId: cid });
  }
  return id;
}

export async function updateApplication(id, data) {
  const { contactIds, ...fields } = data;
  await db.applications.update(Number(id), { ...fields, updatedAt: now() });
  if (contactIds !== undefined) {
    await db.applicationContacts.where('applicationId').equals(Number(id)).delete();
    for (const cid of contactIds) {
      await db.applicationContacts.add({ applicationId: Number(id), contactId: cid });
    }
  }
}

export async function deleteApplication(id) {
  id = Number(id);
  await db.applicationContacts.where('applicationId').equals(id).delete();
  const ivs = await db.interviews.where('applicationId').equals(id).toArray();
  for (const iv of ivs) {
    await db.interviewContacts.where('interviewId').equals(iv.id).delete();
  }
  await db.interviews.where('applicationId').equals(id).delete();
  await db.applications.delete(id);
}

export async function createContact(data) {
  return db.contacts.add({ ...data, isSample: 0, createdAt: now(), updatedAt: now() });
}

export async function updateContact(id, data) {
  await db.contacts.update(Number(id), { ...data, updatedAt: now() });
}

export async function deleteContact(id) {
  id = Number(id);
  await db.applicationContacts.where('contactId').equals(id).delete();
  await db.interviewContacts.where('contactId').equals(id).delete();
  await db.contacts.delete(id);
}

export async function createInterview(data) {
  const { contactIds = [], ...fields } = data;
  const id = await db.interviews.add({
    ...fields,
    applicationId: fields.applicationId ? Number(fields.applicationId) : null,
    isSample: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  for (const cid of contactIds) {
    await db.interviewContacts.add({ interviewId: id, contactId: cid });
  }
  return id;
}

export async function updateInterview(id, data) {
  const { contactIds, ...fields } = data;
  if (fields.applicationId !== undefined) fields.applicationId = fields.applicationId ? Number(fields.applicationId) : null;
  await db.interviews.update(Number(id), { ...fields, updatedAt: now() });
  if (contactIds !== undefined) {
    await db.interviewContacts.where('interviewId').equals(Number(id)).delete();
    for (const cid of contactIds) {
      await db.interviewContacts.add({ interviewId: Number(id), contactId: cid });
    }
  }
}

export async function deleteInterview(id) {
  id = Number(id);
  await db.interviewContacts.where('interviewId').equals(id).delete();
  await db.interviews.delete(id);
}

// Link / unlink helpers
export async function linkContactToApplication(applicationId, contactId) {
  const exists = await db.applicationContacts
    .where('[applicationId+contactId]')
    .equals([Number(applicationId), Number(contactId)])
    .first();
  if (!exists) {
    await db.applicationContacts.add({
      applicationId: Number(applicationId),
      contactId: Number(contactId),
    });
  }
}

export async function unlinkContactFromApplication(applicationId, contactId) {
  await db.applicationContacts
    .where('[applicationId+contactId]')
    .equals([Number(applicationId), Number(contactId)])
    .delete();
}

export async function linkContactToInterview(interviewId, contactId) {
  const exists = await db.interviewContacts
    .where('[interviewId+contactId]')
    .equals([Number(interviewId), Number(contactId)])
    .first();
  if (!exists) {
    await db.interviewContacts.add({
      interviewId: Number(interviewId),
      contactId: Number(contactId),
    });
  }
}

export async function unlinkContactFromInterview(interviewId, contactId) {
  await db.interviewContacts
    .where('[interviewId+contactId]')
    .equals([Number(interviewId), Number(contactId)])
    .delete();
}

// ── Dashboard helpers ────────────────────────────────────────────────────────
export async function createDashboard(data) {
  return db.dashboards.add({ ...data, createdAt: now(), updatedAt: now() });
}

export async function updateDashboard(id, data) {
  await db.dashboards.update(Number(id), { ...data, updatedAt: now() });
}

export async function deleteDashboard(id) {
  await db.dashboards.delete(Number(id));
}

// ── Sample Data Seeding ──────────────────────────────────────────────────────
export async function seedSampleData() {
  const count = await db.applications.where('isSample').equals(1).count();
  if (count > 0) return; // Already seeded

  await db.transaction(
    'rw',
    db.applications,
    db.contacts,
    db.interviews,
    db.applicationContacts,
    db.interviewContacts,
    db.dashboards,
    async () => {
      // ── Contacts ──
      const c1 = await db.contacts.add({
        name: 'Sarah Chen', roleType: 'Recruiter',
        email: 'sarah.chen@example.com', linkedinUrl: 'https://linkedin.com/in/sarahchen',
        notes: 'Technical recruiter at Google. Met at Grace Hopper conference.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const c2 = await db.contacts.add({
        name: 'Marcus Johnson', roleType: 'Hiring Manager',
        email: 'marcus.j@example.com', linkedinUrl: 'https://linkedin.com/in/marcusjohnson',
        notes: 'Engineering Manager for Payments team at Stripe.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const c3 = await db.contacts.add({
        name: 'Emily Rodriguez', roleType: 'Referral',
        email: 'emily.r@example.com', linkedinUrl: 'https://linkedin.com/in/emilyrodriguez',
        notes: 'Former colleague, now SWE at Meta. Referred me internally.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const c4 = await db.contacts.add({
        name: 'David Kim', roleType: 'Employee',
        email: 'david.kim@example.com', linkedinUrl: 'https://linkedin.com/in/davidkim',
        notes: 'Senior engineer at Netflix. Connected via tech meetup.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const c5 = await db.contacts.add({
        name: 'Priya Patel', roleType: 'Recruiter',
        email: 'priya.patel@example.com', linkedinUrl: 'https://linkedin.com/in/priyapatel',
        notes: 'Senior recruiter at Microsoft Azure org. Very responsive.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const c6 = await db.contacts.add({
        name: 'James Wilson', roleType: 'Hiring Manager',
        email: 'james.w@example.com', linkedinUrl: 'https://linkedin.com/in/jameswilson',
        notes: 'Director of Engineering at Airbnb Experiences.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });

      // ── Applications ──
      const a1 = await db.applications.add({
        company: 'Google', role: 'Senior Software Engineer',
        status: 'Interviewing', source: 'Recruiter Outreach',
        dateApplied: '2026-09-15', jobPostingLink: 'https://careers.google.com/jobs/example',
        targetCompensation: '$180K–$250K base + equity', priority: 'High',
        followUpDate: '2026-10-07', nextAction: 'Prepare for onsite loop — review system design',
        notes: 'L5 role in Cloud org. Sarah reached out via LinkedIn.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a2 = await db.applications.add({
        company: 'Stripe', role: 'Staff Engineer — Payments',
        status: 'Applied', source: 'Referral',
        dateApplied: '2026-09-28', jobPostingLink: 'https://stripe.com/jobs/example',
        targetCompensation: '$200K–$280K total comp', priority: 'High',
        followUpDate: '2026-10-10', nextAction: 'Follow up with Marcus if no response by Thursday',
        notes: 'Got referral through Marcus Johnson. Very excited about the team.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a3 = await db.applications.add({
        company: 'Meta', role: 'Production Engineer',
        status: 'Phone Screen', source: 'Referral',
        dateApplied: '2026-09-20', jobPostingLink: 'https://metacareers.com/jobs/example',
        targetCompensation: '$170K–$230K', priority: 'Medium',
        followUpDate: '2026-10-06', nextAction: 'Phone screen scheduled — review OS fundamentals',
        notes: 'Emily Rodriguez referred me. PE role in Infrastructure org.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a4 = await db.applications.add({
        company: 'Netflix', role: 'Senior Software Engineer',
        status: 'Wishlist', source: 'Job Board',
        dateApplied: '', jobPostingLink: 'https://jobs.netflix.com/example',
        targetCompensation: '$300K–$400K total (salary only)', priority: 'Medium',
        followUpDate: '2026-10-15', nextAction: 'Reach out to David Kim for insight on team',
        notes: 'Spotted on LinkedIn job board. Interesting content delivery platform role.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a5 = await db.applications.add({
        company: 'Microsoft', role: 'Principal Software Engineer',
        status: 'Offer', source: 'Recruiter Outreach',
        dateApplied: '2026-08-25', jobPostingLink: 'https://careers.microsoft.com/example',
        targetCompensation: '$195K–$260K base + stock', priority: 'High',
        followUpDate: '2026-10-08', nextAction: 'Review offer letter details and compare comp packages',
        notes: 'Priya Patel reached out. Azure cloud platform team. Offer received Oct 1.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a6 = await db.applications.add({
        company: 'Airbnb', role: 'Backend Engineer',
        status: 'Rejected', source: 'Company Site',
        dateApplied: '2026-08-10', jobPostingLink: 'https://careers.airbnb.com/example',
        targetCompensation: '$160K–$210K', priority: 'Low',
        followUpDate: '', nextAction: '',
        notes: 'Applied directly on company site. Rejected after initial screen — will re-apply in 6 months.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a7 = await db.applications.add({
        company: 'Figma', role: 'Frontend Engineer',
        status: 'Applied', source: 'Cold Apply',
        dateApplied: '2026-10-01', jobPostingLink: 'https://figma.com/careers/example',
        targetCompensation: '$170K–$220K', priority: 'Medium',
        followUpDate: '2026-10-14', nextAction: 'Check application portal for status update',
        notes: 'Applied cold via website. Love the product — would be a great team fit.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const a8 = await db.applications.add({
        company: 'Datadog', role: 'Platform Engineer',
        status: 'Withdrawn', source: 'Job Board',
        dateApplied: '2026-08-20', jobPostingLink: 'https://careers.datadoghq.com/example',
        targetCompensation: '$165K–$215K', priority: 'Low',
        followUpDate: '', nextAction: '',
        notes: 'Withdrew after receiving Microsoft offer. Good team but lower comp.',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });

      // ── Application–Contact links ──
      await db.applicationContacts.bulkAdd([
        { applicationId: a1, contactId: c1 },  // Google ↔ Sarah Chen
        { applicationId: a2, contactId: c2 },  // Stripe ↔ Marcus Johnson
        { applicationId: a3, contactId: c3 },  // Meta ↔ Emily Rodriguez
        { applicationId: a4, contactId: c4 },  // Netflix ↔ David Kim
        { applicationId: a5, contactId: c5 },  // Microsoft ↔ Priya Patel
        { applicationId: a6, contactId: c6 },  // Airbnb ↔ James Wilson
      ]);

      // ── Interviews ──
      const i1 = await db.interviews.add({
        applicationId: a1, roundName: 'Phone Screen',
        date: '2026-09-22T14:00', type: 'Phone',
        prepNotes: 'Review Google coding interview format. Practice 2 medium LC problems.',
        questionsAsked: 'BFS on matrix, sliding window max, OOP design question.',
        reflection: 'Went well — solved both coding problems within time. Interviewer was friendly.',
        status: 'Completed',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const i2 = await db.interviews.add({
        applicationId: a1, roundName: 'Technical Interview — Round 1',
        date: '2026-10-08T10:00', type: 'Video',
        prepNotes: 'System design: design a URL shortener, review DDIA chapters 5-7.',
        questionsAsked: '', reflection: '',
        status: 'Scheduled',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const i3 = await db.interviews.add({
        applicationId: a3, roundName: 'Phone Screen',
        date: '2026-10-06T11:00', type: 'Phone',
        prepNotes: 'Review Linux internals, networking basics, and PE-specific scenarios.',
        questionsAsked: '', reflection: '',
        status: 'Scheduled',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const i4 = await db.interviews.add({
        applicationId: a5, roundName: 'Final Round — Team Match',
        date: '2026-09-28T09:00', type: 'On-site',
        prepNotes: 'Prepare architecture walkthrough for Azure distributed systems.',
        questionsAsked: 'Design a globally distributed cache. Leadership principles discussion.',
        reflection: 'Strong performance. Got positive signals from all interviewers. Offer followed.',
        status: 'Completed',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });
      const i5 = await db.interviews.add({
        applicationId: a6, roundName: 'Initial Screen',
        date: '2026-08-18T15:00', type: 'Video',
        prepNotes: 'Review Airbnb values and recent product launches.',
        questionsAsked: 'Behavioral: conflict resolution, project leadership. Light coding.',
        reflection: 'Interview felt ok but not great. Received rejection email the next week.',
        status: 'Completed',
        isSample: 1, createdAt: now(), updatedAt: now(),
      });

      // ── Interview–Contact links ──
      await db.interviewContacts.bulkAdd([
        { interviewId: i1, contactId: c1 },  // Google phone screen ↔ Sarah
        { interviewId: i3, contactId: c3 },  // Meta phone screen ↔ Emily
        { interviewId: i4, contactId: c5 },  // Microsoft final ↔ Priya
        { interviewId: i5, contactId: c6 },  // Airbnb screen ↔ James
      ]);

      // ── Default Dashboard ──
      await db.dashboards.add({
        name: 'My Job Search',
        description: 'Default overview of all active applications',
        filters: JSON.stringify({}),
        widgets: JSON.stringify([
          'statusSummary', 'sourceBreakdown', 'upcomingFollowUps',
          'upcomingInterviews', 'recentActivity',
        ]),
        isDefault: 1,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  );
}

// ── Clear sample data ────────────────────────────────────────────────────────
export async function clearSampleData() {
  await db.transaction(
    'rw',
    db.applications,
    db.contacts,
    db.interviews,
    db.applicationContacts,
    db.interviewContacts,
    async () => {
      const sampleApps = await db.applications.where('isSample').equals(1).toArray();
      const sampleContacts = await db.contacts.where('isSample').equals(1).toArray();
      const sampleInterviews = await db.interviews.where('isSample').equals(1).toArray();

      for (const app of sampleApps) {
        await db.applicationContacts.where('applicationId').equals(app.id).delete();
      }
      for (const iv of sampleInterviews) {
        await db.interviewContacts.where('interviewId').equals(iv.id).delete();
      }
      for (const c of sampleContacts) {
        await db.applicationContacts.where('contactId').equals(c.id).delete();
        await db.interviewContacts.where('contactId').equals(c.id).delete();
      }

      await db.applications.where('isSample').equals(1).delete();
      await db.contacts.where('isSample').equals(1).delete();
      await db.interviews.where('isSample').equals(1).delete();
    }
  );
}

// ── Export all data (for backup) ─────────────────────────────────────────────
export async function exportAllData() {
  const [applications, contacts, interviews, ac, ic, dashboards] = await Promise.all([
    db.applications.toArray(),
    db.contacts.toArray(),
    db.interviews.toArray(),
    db.applicationContacts.toArray(),
    db.interviewContacts.toArray(),
    db.dashboards.toArray(),
  ]);
  return { applications, contacts, interviews, applicationContacts: ac, interviewContacts: ic, dashboards };
}
