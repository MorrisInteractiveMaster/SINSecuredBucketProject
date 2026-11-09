import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { deny } from './security.mjs';
import {
  META_FIELDS,
  filterRows,
  sortRows,
  toTsv,
  neutralCell,
  META_COLUMNS,
} from './metadata.mjs';
const iso = (v) => v?.toDate?.().toISOString() || null;
const text = (v, max = 254) => (typeof v === 'string' ? v.slice(0, max) : '');
const status = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;
const keys = (d, allowed) => {
  if (
    !d ||
    typeof d !== 'object' ||
    Array.isArray(d) ||
    Object.keys(d).some((k) => !allowed.includes(k))
  )
    deny('invalid-argument', 'Unsupported metadata fields.');
};
const ids = (value) => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 100 ||
    new Set(value).size !== value.length ||
    value.some((v) => typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v))
  )
    deny('invalid-argument');
  return value;
};
function safeFilter(filter = {}) {
  keys(filter, [
    'search',
    'status',
    'provider',
    'admin',
    'action',
    'from',
    'to',
  ]);
  for (const v of Object.values(filter))
    if (typeof v !== 'string' || v.length > 254) deny('invalid-argument');
  return filter;
}
export function createAdminOperations({ db, service, clock = Date.now }) {
  const audit = async (who, event, invitationId = null, extra = {}) => {
    const r = db.collection('auditEvents').doc();
    await r.create({
      actorUid: who.uid,
      event,
      invitationId,
      at: Timestamp.fromMillis(clock()),
      ...extra,
    });
    return r.id;
  };
  async function snapshot(who) {
    await service.authorize(who, 'statusViewing');
    const entries = await db.collection('allowlist').limit(101).get();
    if (entries.size > 100)
      deny(
        'failed-precondition',
        'More than 100 records require a reviewed paginated backend.',
      );
    const refs = entries.docs.map((d) =>
        db.doc(`submissions/${d.data().invitationId}`),
      ),
      submitted = refs.length ? await db.getAll(...refs) : [];
    const events = await db
        .collection('auditEvents')
        .orderBy('at', 'desc')
        .limit(200)
        .get(),
      roles = await db.collection('roles').limit(10).get();
    const latest = new Map();
    for (const e of events.docs)
      if (e.data().invitationId && !latest.has(e.data().invitationId))
        latest.set(e.data().invitationId, {
          ...e.data(),
          auditReference: e.id,
        });
    const now = clock();
    const rows = entries.docs.map((d, i) => {
      const e = d.data(),
        s = submitted[i]?.data() || {},
        last = latest.get(e.invitationId),
        expired = e.expiresAt?.toMillis?.() <= now;
      return {
        name: text(e.name, 100),
        email: text(e.email),
        invitationId: e.invitationId,
        reference: text(e.reference, 64),
        invitationAt: iso(e.createdAt),
        expiresAt: iso(e.expiresAt),
        provider: status(
          e.authenticationProvider,
          ['google.com', 'microsoft.com'],
          'not_recorded',
        ),
        signedInAt: iso(e.firstSignInAt),
        invitationStatus:
          e.status === 'active' && expired
            ? 'expired'
            : status(e.status, ['active', 'revoked', 'removed'], 'invalid'),
        submissionStatus: status(
          s.status,
          ['submitted', 'correction_requested'],
          'pending',
        ),
        submittedAt: iso(s.at),
        retrievalStatus: status(
          s.retrievalStatus,
          ['requested', 'retrieved'],
          'not_started',
        ),
        transferStatus: status(s.transferStatus, ['confirmed'], 'not_started'),
        disposalStatus: status(s.disposalStatus, ['disposed'], 'not_started'),
        responsibleAdminUid: text(e.responsibleAdminUid, 128),
        auditReference: text(last?.auditReference, 64),
        lastAction: text(last?.event || 'not_recorded', 64),
        lastActionAt: iso(last?.at || e.updatedAt || e.createdAt),
        attention:
          s.status === 'correction_requested' ||
          (e.status === 'active' && expired),
      };
    });
    return {
      rows,
      adminDirectory: roles.docs.map((r) => ({
        uid: r.id,
        label: text(r.data().displayLabel, 100) || 'MI administrator',
        active: r.data().active === true,
      })),
      metrics: {
        total: rows.length,
        pending: rows.filter(
          (r) =>
            r.submissionStatus === 'pending' && r.invitationStatus === 'active',
        ).length,
        signedIn: rows.filter((r) => r.signedInAt).length,
        submitted: rows.filter((r) => r.submittedAt).length,
        awaitingRetrieval: rows.filter(
          (r) => r.submittedAt && r.retrievalStatus === 'not_started',
        ).length,
        retrieved: rows.filter((r) => r.retrievalStatus === 'retrieved').length,
        transferred: rows.filter((r) => r.transferStatus === 'confirmed')
          .length,
        disposed: rows.filter((r) => r.disposalStatus === 'disposed').length,
        revoked: rows.filter((r) =>
          ['revoked', 'removed', 'expired', 'invalid'].includes(
            r.invitationStatus,
          ),
        ).length,
        attention: rows.filter((r) => r.attention).length,
      },
      generatedAt: new Date(clock()).toISOString(),
    };
  }
  return {
    overview: snapshot,
    async activity(who, data = {}) {
      keys(data, ['invitationId', 'actor', 'event', 'from', 'to', 'cursor']);
      await service.authorize(who, 'auditViewing');
      for (const v of Object.values(data))
        if (typeof v !== 'string' || v.length > 128 || v.includes('/'))
          deny('invalid-argument');
      let query = db.collection('auditEvents').orderBy('at', 'desc').limit(101);
      if (data.cursor) {
        const c = await db.doc(`auditEvents/${data.cursor}`).get();
        if (!c.exists) deny('invalid-argument');
        query = query.startAfter(c);
      }
      const records = await query.get(),
        page = records.docs.slice(0, 100);
      return {
        events: page
          .map((d) => ({
            id: d.id,
            event: text(d.data().event, 64),
            actorUid: text(d.data().actorUid, 128),
            invitationId: text(d.data().invitationId, 36),
            at: iso(d.data().at),
            count: Number.isSafeInteger(d.data().count) ? d.data().count : null,
          }))
          .filter(
            (e) =>
              (!data.invitationId || e.invitationId === data.invitationId) &&
              (!data.actor || e.actorUid === data.actor) &&
              (!data.event || e.event === data.event) &&
              (!data.from || e.at >= data.from) &&
              (!data.to || e.at.slice(0, 10) <= data.to),
          ),
        cursor: records.size > 100 ? page.at(-1).id : null,
        scanned: page.length,
      };
    },
    async bulk(who, data) {
      keys(data, ['action', 'ids']);
      const chosen = ids(data.ids);
      if (
        chosen.length > 25 ||
        !['revoke', 'assign_self'].includes(data.action)
      )
        deny('invalid-argument');
      await service.authorize(who, 'statusViewing');
      await service.authorize(who, 'invitationManagement');
      await db.runTransaction(async (tx) => {
        await service.authorizeTx(tx, who, 'invitationManagement');
        const role = await tx.get(db.doc(`roles/${who.uid}`));
        if (!role.data()?.active || !role.data()?.invitationManagement) deny();
        const docs = await tx.get(
          db.collection('allowlist').where('invitationId', 'in', chosen),
        );
        if (docs.size !== chosen.length) deny();
        for (const d of docs.docs) {
          const e = d.data();
          tx.update(d.ref, {
            ...(data.action === 'revoke'
              ? { status: 'revoked', revision: e.revision + 1 }
              : { responsibleAdminUid: who.uid }),
            updatedAt: Timestamp.fromMillis(clock()),
          });
          tx.create(db.collection('auditEvents').doc(), {
            actorUid: who.uid,
            event:
              data.action === 'revoke'
                ? 'invitation_revoked'
                : 'administrator_assigned',
            invitationId: e.invitationId,
            at: Timestamp.fromMillis(clock()),
          });
        }
      });
      return { updated: chosen.length };
    },
    async output(who, data) {
      keys(data, [
        'kind',
        'scope',
        'ids',
        'fields',
        'filter',
        'sort',
        'direction',
      ]);
      if (
        !['copy', 'xlsx'].includes(data.kind) ||
        !['one', 'selected', 'visible', 'filtered', 'all'].includes(data.scope)
      )
        deny('invalid-argument');
      await service.authorize(
        who,
        data.kind === 'copy' ? 'metadataCopy' : 'metadataExport',
      );
      const fields = data.fields || META_FIELDS;
      if (
        !Array.isArray(fields) ||
        !fields.length ||
        new Set(fields).size !== fields.length ||
        fields.some((f) => !META_FIELDS.includes(f))
      )
        deny(
          'permission-denied',
          'Only approved administrative metadata may leave the portal.',
        );
      const snap = await snapshot(who);
      let rows = sortRows(
        filterRows(
          snap.rows,
          data.scope === 'all' ? {} : safeFilter(data.filter),
        ),
        data.sort,
        data.direction,
      );
      if (['one', 'selected', 'visible'].includes(data.scope)) {
        const chosen = ids(data.ids);
        if (data.scope === 'one' && chosen.length !== 1)
          deny('invalid-argument');
        const found = new Set(rows.map((r) => r.invitationId));
        if (chosen.some((id) => !found.has(id))) deny();
        rows = rows.filter((r) => chosen.includes(r.invitationId));
      }
      if (!rows.length)
        deny('failed-precondition', 'No records match this action.');
      let base64;
      if (data.kind === 'xlsx') {
        const { default: ExcelJS } = await import('exceljs-community');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Morris Interactive';
        workbook.created = new Date(clock());
        const sheet = workbook.addWorksheet('Portal metadata', {
          views: [{ state: 'frozen', ySplit: 3 }],
        });
        sheet.addRow(['Morris Interactive · authorized portal metadata']);
        sheet.addRow([
          'Generated on',
          new Date(clock()).toISOString(),
          'Synthetic test data only',
        ]);
        sheet.addRow(
          fields.map((f) => META_COLUMNS.find(([key]) => key === f)[1]),
        );
        for (const row of rows)
          sheet.addRow(fields.map((f) => neutralCell(row[f])));
        sheet.columns.forEach((col, i) => {
          col.width = ['email'].includes(fields[i])
            ? 36
            : ['invitationId', 'reference', 'responsibleAdminUid'].includes(
                  fields[i],
                )
              ? 40
              : 24;
        });
        sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(3).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF931B50' },
        };
        sheet.autoFilter = {
          from: { row: 3, column: 1 },
          to: { row: rows.length + 3, column: fields.length },
        };
        base64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString(
          'base64',
        );
      }
      await service.authorize(
        who,
        data.kind === 'copy' ? 'metadataCopy' : 'metadataExport',
      );
      const outputId = randomUUID();
      await db
        .doc(`outputReceipts/${outputId}`)
        .create({
          uid: who.uid,
          kind: data.kind,
          count: rows.length,
          at: Timestamp.fromMillis(clock()),
          consumed: false,
        });
      const auditReference = await audit(
        who,
        data.kind === 'copy'
          ? 'metadata_copy_prepared'
          : 'metadata_export_prepared',
        data.scope === 'one' ? rows[0].invitationId : null,
        { outputId, count: rows.length },
      );
      return {
        outputId,
        auditReference,
        count: rows.length,
        fields,
        generatedAt: snap.generatedAt,
        ...(data.kind === 'copy'
          ? {
              text: toTsv(
                rows,
                fields,
                data.scope !== 'one' || fields.length > 1,
              ),
            }
          : { base64, fileName: 'mi-portal-metadata.xlsx' }),
      };
    },
    async acknowledge(who, data) {
      await service.authorize(who, 'statusViewing');
      keys(data, ['outputId', 'outcome']);
      if (
        typeof data.outputId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(data.outputId) ||
        !['client_confirmed', 'client_failed'].includes(data.outcome)
      )
        deny('invalid-argument');
      await db.runTransaction(async (tx) => {
        const r = db.doc(`outputReceipts/${data.outputId}`),
          s = await tx.get(r),
          e = s.data(),
          role = await tx.get(db.doc(`roles/${who.uid}`));
        if (
          !e ||
          e.uid !== who.uid ||
          e.consumed ||
          clock() - e.at.toMillis() > 600000 ||
          role.data()?.active !== true ||
          role.data()?.[
            e.kind === 'copy' ? 'metadataCopy' : 'metadataExport'
          ] !== true ||
          role.data()?.tenantId !== who.organization.tenantId ||
          role.data()?.objectId !== who.organization.objectId
        )
          deny();
        tx.update(r, { consumed: true, outcome: data.outcome });
        tx.create(db.collection('auditEvents').doc(), {
          actorUid: who.uid,
          event: `metadata_${e.kind === 'copy' ? 'copy' : 'export'}_${data.outcome}`,
          invitationId: null,
          at: Timestamp.fromMillis(clock()),
          outputId: data.outputId,
          count: e.count,
        });
      });
      return { recorded: true };
    },
    async workflow(who, data) {
      keys(data, ['kind', 'invitationId']);
      if (
        !['retrieval', 'transfer', 'burn'].includes(data.kind) ||
        typeof data.invitationId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(data.invitationId)
      )
        deny('invalid-argument');
      await service.authorize(who, 'workflowManagement');
      await service.authorize(who, 'statusViewing');
      const found = await db
        .collection('submissions')
        .doc(data.invitationId)
        .get();
      if (!found.exists)
        deny('failed-precondition', 'A submitted record is required.');
      const auditReference = await audit(
        who,
        `${data.kind}_request_blocked`,
        data.invitationId,
      );
      return {
        outcome: 'blocked',
        auditReference,
        message:
          data.kind === 'burn'
            ? 'Burn is disabled. Verified transfer, disposal authorization, approved retention controls and independent security/privacy approval are required. Backups may remain.'
            : data.kind === 'retrieval'
              ? 'Retrieval is disabled pending verified fresh MFA, approved key custody and independent review.'
              : 'Transfer confirmation is disabled until approved retrieval and an official record destination are demonstrated.',
      };
    },
  };
}
