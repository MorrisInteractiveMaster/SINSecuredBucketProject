import { randomUUID, createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { deny, emailKey, checkFresh, normalizeSin } from '../../functions/lib/security.mjs';
import { validRequestTemplate, validRequestValue } from '../../functions/lib/request-types.mjs';
import { exactKeys } from './gates.mjs';
import { liveSinRelease } from './one-time-sin.mjs';
import { createRequestCrypto } from './request-crypto.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const id = (value) => { if (typeof value !== 'string' || value.length !== 36 || !uuid.test(value)) deny('invalid-argument'); return value; };
export const requestsEnabled = (policy) => policy?.enabled === true && uuid.test(policy.approvalReference || '');
const projection = (doc) => {
  const a = doc.data();
  return { id: doc.id, invitationId: a.invitationId, templateId: a.templateId, template: a.template,
    status: a.status, submittedAt: a.submittedAt?.toDate().toISOString() ?? null,
    viewedAt: a.viewedAt?.toDate().toISOString() ?? null };
};
export function createRequests({ db, clock, legacy, credential, kmsFetcher, custody, files }) {
  const crypto = createRequestCrypto({ credential, kmsFetcher, custody });
  const at = () => Timestamp.fromMillis(clock());
  // requestsV2 is a document namespace. All collections are under requestsV2/v1.
  const item = (kind, value) => db.doc('requestsV2/v1/' + kind + '/' + value);
  const items = (kind) => db.collection('requestsV2/v1/' + kind);
  const audit = (tx, who, assignmentId, event, extra = {}) => tx.create(db.collection('auditEvents').doc(), {
    actorUid: who.uid, assignmentId, event, at: at(), ...extra,
  });
  async function release(tx) {
    const [flag, live, staff] = await tx.getAll(db.doc('policy/requests-v2'), db.doc('policy/sin-release'), db.doc('policy/access'));
    if (!requestsEnabled(flag.data()) || !liveSinRelease(live.data()) || staff.data()?.enabled !== true ||
        staff.data()?.invitationImportApproved !== true) deny('failed-precondition', 'Information requests are closed.');
    return { ...flag.data(), kmsKey: live.data().kmsKey };
  }
  async function contractor(tx, who) {
    const entry = (await tx.get(db.doc('allowlist/' + emailKey(who.email)))).data();
    if (entry?.status !== 'active' || !uuid.test(entry.invitationId || '') || !entry.expiresAt || entry.expiresAt.toMillis() <= clock()) deny();
    if (!await legacy.mailboxVerified(tx, who, entry)) deny('permission-denied', 'Verify your mailbox first.', 'bucket-code');
    return entry;
  }
  async function owned(tx, who, assignmentId) {
    const entry = await contractor(tx, who);
    const doc = await tx.get(item('assignments', id(assignmentId)));
    const assignment = doc.data();
    if (!assignment || assignment.emailKey !== emailKey(who.email) || assignment.invitationId !== entry.invitationId) deny();
    return { entry, doc, assignment };
  }
  async function available(tx, who, assignmentId) {
    const result = await owned(tx, who, assignmentId);
    if (result.assignment.status !== 'pending') deny('already-exists', 'This request is already completed or cancelled.');
    return result;
  }
  const gateAndAuthorize = async (tx, authorize) => { await authorize(tx); return release(tx); };
  async function staffRead(who, data, authorize, fileAction) {
    exactKeys(data, ['assignmentId']);
    checkFresh(who.authTime, clock(), 300);
    const assignmentId = id(data.assignmentId);
    const result = await db.runTransaction(async (tx) => {
      const policy = await gateAndAuthorize(tx, authorize);
      const [assignmentDoc, sealed] = await tx.getAll(item('assignments', assignmentId), item('payloads', assignmentId));
      const assignment = assignmentDoc.data();
      if (!assignment || !['submitted', 'viewed'].includes(assignment.status)) deny('failed-precondition', 'This request is not available.');
      if ((assignment.template.type === 'file') !== Boolean(fileAction)) deny('invalid-argument');
      if (fileAction && (!files || policy.filesEnabled !== true)) deny('failed-precondition', 'Files are closed.');
      if (!fileAction && !sealed.exists) deny('failed-precondition');
      if (assignment.template.type === 'sin') {
        tx.delete(item('payloads', assignmentId));
        tx.update(assignmentDoc.ref, { status: 'removed', viewedAt: at() });
        audit(tx, who, assignmentId, 'request_one_time_consumed', { invitationId: assignment.invitationId });
      } else {
        audit(tx, who, assignmentId, fileAction ? 'request_file_' + fileAction + '_requested' : 'request_value_view_requested', { invitationId: assignment.invitationId });
      }
      return { assignment, envelope: sealed.data(), policy };
    });
    try {
      const output = fileAction ? await files.deliver(result.assignment.file, fileAction, result.policy) :
        { value: await crypto.decrypt(assignmentId, result.envelope) };
      await db.runTransaction(async (tx) => {
        await gateAndAuthorize(tx, authorize);
        if (result.assignment.template.type !== 'sin') {
          const current = (await tx.get(item('assignments', assignmentId))).data();
          if (!['submitted', 'viewed'].includes(current?.status)) deny();
          tx.update(item('assignments', assignmentId), { status: 'viewed', viewedAt: at() });
          audit(tx, who, assignmentId, fileAction ? 'request_file_' + fileAction + '_authorized' : 'request_value_viewed', { invitationId: current.invitationId });
        }
      });
      checkFresh(who.authTime, clock(), 300);
      return output;
    } catch {
      deny('failed-precondition', result.assignment.template.type === 'sin' ?
        'The one-time retrieval was consumed. Contact Morris Interactive about failed delivery.' : 'The requested value or file could not be delivered.');
    }
  }
  return {
    enabled: async () => requestsEnabled((await db.doc('policy/requests-v2').get()).data()),
    cutover: async () => {
      const policy = (await db.doc('policy/requests-v2').get()).data();
      return policy?.cutover === true || requestsEnabled(policy);
    },
    async list(who, data = {}) {
      exactKeys(data, []);
      return db.runTransaction(async (tx) => {
        const policy = await release(tx);
        const entry = await contractor(tx, who);
        const rows = await tx.get(items('assignments').where('emailKey', '==', emailKey(who.email)).limit(101));
        if (rows.size > 100) deny('failed-precondition', 'Too many requests. Contact Morris Interactive.');
        return { filesEnabled: policy.filesEnabled === true && Boolean(files), assignments: rows.docs.filter((doc) => doc.data().invitationId === entry.invitationId).map(projection) };
      });
    },
    async admin(who, data, authorize) {
      exactKeys(data, []);
      return db.runTransaction(async (tx) => {
        const policy = await gateAndAuthorize(tx, authorize);
        const templates = await tx.get(items('templates').limit(101));
        const assignments = await tx.get(items('assignments').limit(1001));
        if (templates.size > 100 || assignments.size > 1000) deny('failed-precondition', 'Request capacity requires review.');
        return { filesEnabled: policy.filesEnabled === true && Boolean(files), templates: templates.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          assignments: assignments.docs.map(projection) };
      });
    },
    async template(who, data, authorize) {
      exactKeys(data, ['id', 'type', 'label', 'instructions', 'maxLength', 'status']);
      const templateId = data.id !== undefined ? id(data.id) : randomUUID();
      const template = { type: data.type, label: data.label, instructions: data.instructions, maxLength: data.maxLength, status: data.status };
      if (!validRequestTemplate(template)) deny('invalid-argument', 'Check the request label, instructions, type and limits.');
      return db.runTransaction(async (tx) => {
        await gateAndAuthorize(tx, authorize);
        const existing = (await tx.get(item('templates', templateId))).data();
        if (data.id && !existing) deny('not-found');
        if (existing && existing.type !== template.type) deny('invalid-argument', 'Create a new template to change the request type.');
        const saved = { ...template, revision: randomUUID() };
        tx.set(item('templates', templateId), saved);
        audit(tx, who, null, 'request_template_saved', { templateId });
        return { id: templateId, ...saved };
      });
    },
    async assign(who, data, authorize) {
      exactKeys(data, ['invitationIds', 'templateIds']);
      for (const key of ['invitationIds', 'templateIds']) {
        if (!Array.isArray(data[key]) || !data[key].length || new Set(data[key]).size !== data[key].length) deny('invalid-argument');
        data[key].forEach(id);
      }
      if (data.invitationIds.length * data.templateIds.length > 50) deny('invalid-argument', 'Assign at most 50 requests at a time.');
      const pairs = data.invitationIds.flatMap((invitationId) => data.templateIds.map((templateId) => ({
        invitationId, templateId, id: randomUUID(), slot: createHash('sha256').update(invitationId + ':' + templateId).digest('hex'),
      })));
      return db.runTransaction(async (tx) => {
        await gateAndAuthorize(tx, authorize);
        const invitations = await tx.get(db.collection('allowlist').limit(101));
        if (invitations.size > 100) deny('failed-precondition');
        const templates = await tx.getAll(...data.templateIds.map((value) => item('templates', value)));
        const slots = await tx.getAll(...pairs.map((pair) => item('slots', pair.slot)));
        const entries = pairs.map((pair, i) => {
          const entryDoc = invitations.docs.find((doc) => doc.data().invitationId === pair.invitationId);
          const template = templates[data.templateIds.indexOf(pair.templateId)].data();
          if (!entryDoc || entryDoc.data().status !== 'active' || !entryDoc.data().expiresAt || entryDoc.data().expiresAt.toMillis() <= clock() ||
              !template || template.status !== 'active' || !validRequestTemplate(template)) deny('failed-precondition', 'Use active contractors and request types.');
          return { ...pair, emailKey: entryDoc.id, template, skip: slots[i].exists };
        });
        let created = 0;
        for (const entry of entries) {
          if (entry.skip) continue;
          tx.create(item('slots', entry.slot), { assignmentId: entry.id });
          tx.create(item('assignments', entry.id), { invitationId: entry.invitationId, emailKey: entry.emailKey,
            templateId: entry.templateId, template: entry.template, status: 'pending', createdAt: at() });
          audit(tx, who, entry.id, 'request_assigned', { invitationId: entry.invitationId });
          created++;
        }
        return { created, unchanged: entries.length - created };
      });
    },
    async cancel(who, data, authorize) {
      exactKeys(data, ['assignmentId']);
      return db.runTransaction(async (tx) => {
        await gateAndAuthorize(tx, authorize);
        const assignment = item('assignments', id(data.assignmentId));
        const current = (await tx.get(assignment)).data();
        if (!current || !['pending', 'quarantined'].includes(current.status)) deny('failed-precondition', 'Only pending requests can be cancelled.');
        tx.update(assignment, { status: 'cancelled' });
        audit(tx, who, data.assignmentId, 'request_cancelled', { invitationId: current.invitationId });
        return { cancelled: true };
      });
    },
    async submit(who, data) {
      exactKeys(data, ['assignmentId', 'value']);
      const assignmentId = id(data.assignmentId);
      const { template, kmsKey } = await db.runTransaction(async (tx) => {
        const policy = await release(tx);
        const { assignment } = await available(tx, who, assignmentId);
        return { template: assignment.template, kmsKey: policy.kmsKey };
      });
      if (!validRequestValue(data.value, template)) deny('invalid-argument', 'Check the requested value format.');
      const value = template.type === 'sin' ? normalizeSin(data.value) : data.value;
      const envelope = await crypto.encrypt(assignmentId, value, kmsKey);
      await db.runTransaction(async (tx) => {
        const policy = await release(tx);
        const { doc, assignment } = await available(tx, who, assignmentId);
        if (policy.kmsKey !== kmsKey) deny();
        tx.create(item('payloads', assignmentId), envelope);
        tx.update(doc.ref, { status: 'submitted', submittedAt: at() });
        audit(tx, who, assignmentId, 'request_submitted', { invitationId: assignment.invitationId });
      });
      return { accepted: true };
    },
    reveal: (who, data, authorize) => staffRead(who, data, authorize),
    file: (who, data, authorize, action) => staffRead(who, data, authorize, action),
    async startUpload(who, data) {
      exactKeys(data, ['assignmentId', 'name', 'size', 'mime']);
      const assignmentId = id(data.assignmentId), uploadId = randomUUID();
      const policy = await db.runTransaction(async (tx) => {
        const policy = await release(tx);
        const { assignment, doc } = await owned(tx, who, assignmentId);
        if (!['pending', 'quarantined'].includes(assignment.status)) deny('already-exists');
        if (!files || policy.filesEnabled !== true || assignment.template.type !== 'file') deny('failed-precondition', 'File uploads are closed.');
        files.validate(data, assignment.template.maxLength);
        const previous = (await tx.get(item('uploads', assignmentId))).data();
        if (previous && previous.expiresAt.toMillis() > clock()) deny('resource-exhausted', 'An upload is already in progress. Wait before retrying.');
        tx.set(item('uploads', assignmentId), { uploadId, uid: who.uid, size: data.size, expiresAt: Timestamp.fromMillis(clock() + 5 * 60_000) });
        tx.update(doc.ref, { status: 'quarantined' });
        audit(tx, who, assignmentId, 'request_upload_started', { invitationId: assignment.invitationId });
        return policy;
      });
      // A signing failure leaves quarantine closed. A retry is allowed after expiry.
      return { uploadId, ...await files.upload(assignmentId, uploadId, data.size, policy) };
    },
    async finishUpload(who, data) {
      exactKeys(data, ['assignmentId', 'uploadId']);
      const assignmentId = id(data.assignmentId), uploadId = id(data.uploadId);
      const result = await db.runTransaction(async (tx) => {
        const policy = await release(tx);
        const { assignment } = await owned(tx, who, assignmentId);
        const upload = (await tx.get(item('uploads', assignmentId))).data();
        if (!files || policy.filesEnabled !== true || assignment.template.type !== 'file' ||
            !upload || upload.uploadId !== uploadId || upload.uid !== who.uid) deny();
        if (['submitted', 'viewed'].includes(assignment.status)) return { complete: true };
        if (assignment.status !== 'quarantined') deny('failed-precondition');
        return { policy, upload };
      });
      if (result.complete) return { accepted: true };
      let file;
      try { file = await files.inspect(assignmentId, uploadId, result.upload.size, result.policy); }
      catch { deny('failed-precondition', 'The file remains quarantined. Validation or scanning is incomplete.'); }
      await db.runTransaction(async (tx) => {
        const policy = await release(tx);
        const { assignment, doc } = await owned(tx, who, assignmentId);
        const upload = (await tx.get(item('uploads', assignmentId))).data();
        if (policy.filesEnabled !== true || upload?.uploadId !== uploadId || upload.uid !== who.uid) deny();
        if (['submitted', 'viewed'].includes(assignment.status)) return;
        if (assignment.status !== 'quarantined') deny();
        tx.update(doc.ref, { status: 'submitted', submittedAt: at(), file });
        audit(tx, who, assignmentId, 'request_file_accepted', { invitationId: assignment.invitationId });
      });
      return { accepted: true };
    },
    async deleteFile(who, data, authorize) {
      exactKeys(data, ['assignmentId', 'confirmation']);
      const assignmentId = id(data.assignmentId);
      if (data.confirmation !== 'DELETE') deny('invalid-argument');
      checkFresh(who.authTime, clock(), 300);
      const result = await db.runTransaction(async (tx) => {
        const policy = await gateAndAuthorize(tx, authorize);
        const doc = item('assignments', assignmentId), assignment = (await tx.get(doc)).data();
        if (!files || policy.filesEnabled !== true || assignment?.template.type !== 'file' ||
            !['submitted', 'viewed', 'deleting', 'deleted'].includes(assignment.status)) deny();
        if (assignment.status === 'deleted') return { complete: true };
        tx.update(doc, { status: 'deleting' });
        audit(tx, who, assignmentId, 'request_file_deletion_started', { invitationId: assignment.invitationId });
        return { file: assignment.file, policy };
      });
      if (result.complete) return { deleted: true };
      await files.delete(result.file, result.policy);
      await db.runTransaction(async (tx) => {
        await gateAndAuthorize(tx, authorize);
        const doc = item('assignments', assignmentId), assignment = (await tx.get(doc)).data();
        if (assignment?.status === 'deleted') return;
        if (assignment?.status !== 'deleting') deny();
        tx.update(doc, { status: 'deleted', file: null });
        audit(tx, who, assignmentId, 'request_file_deleted', { invitationId: assignment.invitationId });
      });
      return { deleted: true };
    },
  };
}
