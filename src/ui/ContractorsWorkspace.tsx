import React, { useEffect, useMemo, useState } from 'react';
import { Button, Badge, Help, Modal, date, time, human } from './components';
import { StaffRequest, type Catalog, type Template } from './Requests';
import type { Api, Context, Row, Event } from './types';
import { message } from '../app/client';
import { requestKinds, requestStatusLabel } from '../../functions/lib/request-types.mjs';
import { accessExplanation } from '../../functions/lib/contractor-access.mjs';
import { previewContractorCsv, assignmentBatches, creationBatches } from '../../functions/lib/contractor-workspace.mjs';
import { normalizeEmail, emailLocalPart } from '../../functions/lib/csv.mjs';
const inDays = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const expiryISO = (value: string) => new Date(value + 'T23:59:59').toISOString();
const pending = (status: string) => ['pending', 'quarantined', 'rejected'].includes(status);
const emptyTemplate = (): Template => ({ id: '', type: 'sin', label: '', instructions: '', maxLength: 24, status: 'active', revision: '' });
type Preview = ReturnType<typeof previewContractorCsv>[number];
type Review = { reviewId: string | null; action: string; requiredConfirmation: string; newExpiry: string | null; rows: { invitationId: string; name: string; email: string; accessStatus: string; expiresAt: string | null; eligible: boolean; reason: string }[] };
function TemplatePicker({ templates, value, onChange, excluded = [] }: { templates: Template[]; value: string[]; onChange: (ids: string[]) => void; excluded?: string[] }) {
  const [search, setSearch] = useState('');
  return <fieldset className="template-picker"><legend>Requested information</legend>
    <label className="field-label">Find a request type<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="template-choices">{templates.filter((t) => t.status === 'active' && t.label.toLowerCase().includes(search.toLowerCase())).map((t) => <label key={t.id} className="template-choice">
      <input type="checkbox" checked={value.includes(t.id)} disabled={excluded.includes(t.id)} onChange={(e) => onChange(e.target.checked ? [...value, t.id] : value.filter((id) => id !== t.id))} />
      <span><strong>{t.label}</strong><small>{requestKinds[t.type].name}{excluded.includes(t.id) ? ' · already assigned' : ''}</small></span></label>)}</div>
    {!templates.some((t) => t.status === 'active') && <p>Create an active template in Manage templates first.</p>}
    <p>{value.length} selected. Existing requests and their original labels are preserved.</p>
  </fieldset>;
}
export function ContractorsWorkspace({ context, api, rows, refreshRows, authorizationPending, openLegacy, copyMetadata, exportMetadata }: {
  context: Context; api: Api; rows: Row[]; refreshRows: () => Promise<void>; authorizationPending: boolean;
  openLegacy: (row: Row) => void; copyMetadata: (ids: string[]) => void; exportMetadata: (ids: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [access, setAccess] = useState('all'), [type, setType] = useState('all'), [state, setState] = useState('all');
  const [sort, setSort] = useState('name'), [descending, setDescending] = useState(false), [size, setSize] = useState(10), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]), [expanded, setExpanded] = useState<string>();
  const [dialog, setDialog] = useState<'add' | 'bulk' | 'assign' | 'templates' | 'access' | null>(null);
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [expiry, setExpiry] = useState(inDays), [types, setTypes] = useState<string[]>([]), [targets, setTargets] = useState<string[]>([]);
  const [step, setStep] = useState(false), [csv, setCsv] = useState(''), [preview, setPreview] = useState<Preview[]>([]), [chosen, setChosen] = useState<string[]>([]), [overrides, setOverrides] = useState<Record<string, string[]>>({}), [previewSearch, setPreviewSearch] = useState('');
  const [results, setResults] = useState<string[]>([]), [action, setAction] = useState('restore'), [reviews, setReviews] = useState<Review[]>([]), [confirmation, setConfirmation] = useState('');
  const [template, setTemplate] = useState<Template>(emptyTemplate), [templateSearch, setTemplateSearch] = useState('');
  const allowed = !authorizationPending && Boolean(context.permissions?.invitationManagement), locked = busy || !allowed || !catalog;
  async function refresh() {
    try { setCatalog(await api<Catalog>('portalRequestsOverview')); setError(''); }
    catch (cause) { setCatalog(undefined); setError(message(cause)); }
  }
  useEffect(() => { if (!authorizationPending) void refresh(); }, [rows, authorizationPending]);
  useEffect(() => { setStep(false); setError(''); setResults([]); }, [dialog]);
  async function run(work: () => Promise<void>) {
    if (busy || authorizationPending) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  const assignments = catalog?.assignments ?? [];
  const forRow = (id: string) => assignments.filter((a) => a.invitationId === id);
  const filtered = useMemo(() => rows.filter((r) => {
    const requests = assignments.filter((a) => a.invitationId === r.invitationId);
    return (!search || (r.name + ' ' + r.email).toLowerCase().includes(search.toLowerCase())) && (access === 'all' || r.invitationStatus === access) &&
      (type === 'all' && state === 'all' || requests.some((a) => (type === 'all' || a.template.type === type) && (state === 'all' || a.status === state)));
  }).sort((a, b) => String(a[sort as keyof Row] ?? '').localeCompare(String(b[sort as keyof Row] ?? '')) * (descending ? -1 : 1)), [rows, assignments, search, access, type, state, sort, descending]);
  useEffect(() => setPage(1), [search, access, type, state, size]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages), visible = filtered.slice((current - 1) * size, current * size);
  const chosenRows = rows.filter((r) => selected.includes(r.invitationId));
  function startAdd() { setName(''); setEmail(''); setExpiry(inDays()); setTypes([]); setDialog('add'); }
  function startAssign(ids: string[]) { setTargets(ids); setTypes([]); setDialog('assign'); }
  function startAccess(next: string, ids: string[]) { setAction(next); setTargets(ids); setReviews([]); setConfirmation(''); setExpiry(inDays()); setDialog('access'); }
  function close() { if (!busy) setDialog(null); }
  async function afterSave(text: string) { setNotice(text); await refreshRows(); await refresh(); }
  async function batches(items: any[], operation: string, describe: (result: any, i: number) => string) {
    for (let i = 0; i < items.length; i++) {
      try { const result = await api(operation, items[i]); setResults((old) => [...old, describe(result, i), ...(result.results ?? []).map((entry: any) => `${rows.find((row) => row.invitationId === entry.invitationId)?.email ?? entry.invitationId} · ${catalog?.templates.find((t) => t.id === entry.templateId)?.label ?? 'Request'}: ${entry.status === 'already_assigned' ? 'Already assigned; preserved' : 'Created'}`)]); }
      catch (cause) { setResults((old) => [...old, `Batch ${i + 1} failed; later batches were not sent. Refresh and preview before retrying.`]); throw cause; }
    }
  }
  return <section className="contractors-workspace" aria-label="Contractors and requests">
    <div className="cw-overview">{[
      ['Active', rows.filter((r) => r.invitationStatus === 'active').length], ['Expired', rows.filter((r) => r.invitationStatus === 'expired').length],
      ['Revoked', rows.filter((r) => r.invitationStatus === 'revoked').length], ['Removed', rows.filter((r) => r.invitationStatus === 'removed').length],
      ['Pending requests', catalog ? assignments.filter((a) => pending(a.status)).length : '—'], ['Submitted', catalog ? assignments.filter((a) => ['submitted', 'viewed', 'removed'].includes(a.status)).length : '—'],
      ['Awaiting action', catalog ? assignments.filter((a) => ['submitted', 'quarantined', 'rejected', 'deleting'].includes(a.status)).length : '—'],
    ].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
    <div className="panel-heading"><div><h2>Contractors & requests <span className="count-pill">{rows.length}</span></h2><p>All access states are shown. Confidential values stay out of this list.</p></div>
      <div className="toolbar-actions"><Button kind="primary" icon="plus" disabled={locked} onClick={startAdd}>Add contractor</Button>
        <Button disabled={locked} onClick={() => { setCsv(''); setPreview([]); setChosen([]); setOverrides({}); setPreviewSearch(''); setTypes([]); setExpiry(inDays()); setDialog('bulk'); }}>Bulk add / assign</Button>
        <Button disabled={locked} onClick={() => { setTemplate(emptyTemplate()); setDialog('templates'); }}>Manage templates</Button></div></div>
    {authorizationPending && <p role="status">Checking your authorization. Administrative and confidential actions are paused.</p>}
    {error && !dialog && <p role="alert">{error} <Button disabled={authorizationPending || busy} onClick={() => void refresh()}>Retry request workspace</Button></p>}
    {notice && <p role="status" className="callout">{notice}</p>}
    <p className="gate-note">{catalog ? catalog.filesEnabled ? 'Information requests are enabled.' : 'Information requests are enabled. PDF uploads and file access remain disabled by the separate file release gate.' : 'Request management is unavailable until the requests service can be verified. Contractor access records remain visible.'}</p>
    <div className="cw-filters"><label>Search contractors<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" /></label>
      <label>Access status<select value={access} onChange={(e) => setAccess(e.target.value)}><option value="all">All access states</option>{['active', 'expired', 'revoked', 'removed', 'invalid'].map((s) => <option key={s} value={s}>{human(s)}</option>)}</select></label>
      <label>Request type<select value={type} onChange={(e) => setType(e.target.value)}><option value="all">All types</option>{Object.entries(requestKinds).map(([id, kind]) => <option key={id} value={id}>{kind.name}</option>)}</select></label>
      <label>Request status<select value={state} onChange={(e) => setState(e.target.value)}><option value="all">All request states</option>{['pending', 'submitted', 'viewed', 'removed', 'cancelled', 'quarantined', 'rejected'].map((s) => <option key={s} value={s}>{requestStatusLabel(s, '')}</option>)}</select></label>
      <Button onClick={() => { setSearch(''); setAccess('all'); setType('all'); setState('all'); }}>Reset filters</Button></div>
    <div className="cw-selection"><span>{selected.length} selected · {filtered.length} of {rows.length} contractors match</span>
      <Button disabled={locked || !chosenRows.length || chosenRows.some((r) => r.invitationStatus !== 'active')} onClick={() => startAssign(selected)}>Add requests to selected</Button>
      <Button disabled={locked || !selected.length} onClick={() => startAccess('restore', selected)}>Review and restore access</Button>
      <Button disabled={locked || !selected.length} onClick={() => startAccess('renew', selected)}>Renew invitations</Button>
      <Button disabled={locked || !selected.length} onClick={() => startAccess('revoke', selected)}>Review revocation</Button>
      {chosenRows.some((r) => r.invitationStatus !== 'active') && <p>Requests can only be added to active, unexpired accounts. Review revoked access and renew expiry separately.</p>}
    </div>
    <div className="cw-selection"><Button disabled={authorizationPending || busy || !context.permissions?.metadataCopy || !filtered.length} onClick={() => copyMetadata(filtered.map((r) => r.invitationId))}>Copy all filtered ({filtered.length})</Button>
      <Button disabled={authorizationPending || busy || !context.permissions?.metadataCopy || !selected.length} onClick={() => copyMetadata(selected)}>Copy selected ({selected.length})</Button>
      <Button disabled={authorizationPending || busy || !context.permissions?.metadataExport || !filtered.length} onClick={() => exportMetadata(filtered.map((r) => r.invitationId))}>Export filtered metadata</Button></div>
    <div className="table-scroll cw-table" role="region" aria-label="Contractors and assigned information" tabIndex={0}><table><thead><tr>
      <th><input type="checkbox" aria-label="Select visible contractors" checked={visible.length > 0 && visible.every((r) => selected.includes(r.invitationId))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...visible.map((r) => r.invitationId)])] : selected.filter((id) => !visible.some((r) => r.invitationId === id)))} /></th>
      {['name', 'invitationStatus', 'expiresAt'].map((key) => <th key={key} aria-sort={sort === key ? descending ? 'descending' : 'ascending' : 'none'}><span className="cw-column"><button onClick={() => { setSort(key); setDescending(sort === key ? !descending : false); }}>{key === 'name' ? 'Contractor' : key === 'invitationStatus' ? 'Access status' : 'Expiry'} <span aria-hidden="true">↕</span></button>{key === 'invitationStatus' && <Help text="Revoked is an explicit access decision. Expired means an approved account has passed its expiry date. These require different reviews." />}</span></th>)}
      <th>Requested information</th><th>Progress</th><th>Actions</th></tr></thead><tbody>
      {visible.map((row) => { const requests = forRow(row.invitationId), received = requests.filter((a) => !pending(a.status) && a.status !== 'cancelled').length;
        return <React.Fragment key={row.invitationId}><tr><td><input type="checkbox" aria-label={'Select ' + row.email} checked={selected.includes(row.invitationId)} onChange={(e) => setSelected(e.target.checked ? [...selected, row.invitationId] : selected.filter((id) => id !== row.invitationId))} /></td>
          <td><button className="record-link" aria-expanded={expanded === row.invitationId} aria-controls={'details-' + row.invitationId} onClick={() => setExpanded(expanded === row.invitationId ? undefined : row.invitationId)}>{row.name || emailLocalPart(row.email)}</button><span className="cw-email">{row.email}</span></td>
          <td><Badge value={row.invitationStatus} /></td><td>{date(row.expiresAt)}</td>
          <td>{!catalog ? 'Unavailable' : !requests.length ? 'No assigned requests' : <ul className="cw-request-labels">{requests.map((a) => <li key={a.id}><span>{a.template.label}</span><Badge value={requestStatusLabel(a.status, a.template.type)} /></li>)}</ul>}</td>
          <td>{catalog ? `${received} / ${requests.filter((a) => a.status !== 'cancelled').length} received` : 'Unavailable'}</td>
          <td><Button disabled={locked || row.invitationStatus !== 'active'} title={row.invitationStatus === 'active' ? 'Choose information for this contractor' : accessExplanation(row.invitationStatus)} onClick={() => startAssign([row.invitationId])}>Add request</Button></td></tr>
          {expanded === row.invitationId && <tr id={'details-' + row.invitationId}><td colSpan={7}><div className="cw-details"><h3>{row.name || row.email} · access and requests</h3><p>{accessExplanation(row.invitationStatus)}</p><p>Invitation reference: {row.reference} · Expiry: {date(row.expiresAt)}</p>
            <div className="toolbar-actions">{row.invitationStatus === 'revoked' && <Button disabled={locked} onClick={() => startAccess('restore', [row.invitationId])}>Review and restore this account</Button>}
              {['active', 'expired'].includes(row.invitationStatus) && <><Button disabled={locked} onClick={() => startAccess('renew', [row.invitationId])}>Renew invitation</Button><Button disabled={locked} onClick={() => startAccess('revoke', [row.invitationId])}>Revoke access</Button></>}
              <Button disabled={authorizationPending} onClick={() => openLegacy(row)}>Earlier record & metadata</Button></div>
            <div className="request-card-grid">{requests.map((a) => <StaffRequest key={a.id} assignment={a} api={api} canManage={allowed} canDelete={Boolean(context.permissions?.administratorManagement)} authorizationPending={authorizationPending || !catalog} filesEnabled={catalog?.filesEnabled === true} refresh={async () => { await refreshRows(); await refresh(); }} />)}</div>
            {context.permissions?.auditViewing && <AccessTimeline api={api} invitationId={row.invitationId} disabled={authorizationPending} />}</div></td></tr>}
        </React.Fragment>; })}
      {!visible.length && <tr><td colSpan={7}>No contractors match these filters. Reset filters to see all access states.</td></tr>}
    </tbody></table></div>
    <div className="table-footer"><span>{filtered.length ? (current - 1) * size + 1 : 0}–{Math.min(current * size, filtered.length)} of {filtered.length}</span>
      <label>Rows <select value={size} onChange={(e) => setSize(Number(e.target.value))}>{[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <Button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button><span>Page {current} of {pages}</span><Button disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button></div>
    {dialog && <Modal title={{ add: 'Add contractor', bulk: 'Bulk add / assign', assign: 'Add requests', templates: 'Manage templates', access: 'Review access change' }[dialog]} onClose={close} wide>
      {error && <p role="alert">{error}</p>}{results.length > 0 && <ol aria-label="Batch results" role="status">{results.map((result, i) => <li key={i}>{result}</li>)}</ol>}
      {dialog === 'add' && <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const normalized = normalizeEmail(email); if (!types.length) throw new Error('Choose at least one request type.');
        if (!step) { if (!name.trim()) setName(emailLocalPart(email)); setEmail(normalized); setStep(true); return; }
        await api('portalContractorCreate', { name: name.trim() || emailLocalPart(email), email: normalized, expiresAt: expiryISO(expiry), templateIds: types });
        setDialog(null); await afterSave('Contractor and requests saved. Share the website link manually; no email was sent.');
      }); }}>
        {!step ? <><label className="field-label">Name (optional)<input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field-label">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><Expiry value={expiry} onChange={setExpiry} />
          <TemplatePicker templates={catalog?.templates ?? []} value={types} onChange={setTypes} /></> : <div className="callout"><h3>Review contractor and requests</h3><p>{name.trim() || emailLocalPart(email)} · {email}</p><p>Access expires {expiry}. This is an access deadline, not a submission promise.</p><ul>{types.map((id) => <li key={id}>{catalog?.templates.find((t) => t.id === id)?.label}</li>)}</ul><p>No invitation email will be sent.</p></div>}
        <div className="modal-actions">{step && <Button disabled={busy} onClick={() => setStep(false)}>Back</Button>}<Button kind="primary" type="submit" busy={busy} disabled={locked || !types.length}>{step ? 'Save contractor & requests' : 'Review contractor'}</Button></div>
      </form>}
      {dialog === 'assign' && <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
        if (!step) { setStep(true); return; }
        await batches(assignmentBatches(targets.map((invitationId) => ({ invitationId, templateIds: types }))), 'portalRequestAssign', (r, i) => `Batch ${i + 1}: ${r.created} requests added; ${r.unchanged} already assigned and preserved.`);
        setTypes([]); setStep(false); await afterSave('Request assignment complete. Existing requests were preserved.');
      }); }}><p>{targets.length} active contractor{targets.length === 1 ? '' : 's'} selected.</p>
        {!step ? <TemplatePicker templates={catalog?.templates ?? []} value={types} onChange={setTypes} excluded={targets.length === 1 ? forRow(targets[0]).map((a) => a.templateId) : []} /> : <p>Assign {types.length} request types to {targets.length} contractors? Existing matches are skipped. Every operation is limited to 50 assignments.</p>}
        {step && <Button disabled={busy} onClick={() => setStep(false)}>Back</Button>}<Button type="submit" kind="primary" busy={busy} disabled={locked || !types.length}>{step ? 'Confirm assignments' : 'Review assignments'}</Button></form>}
      {dialog === 'bulk' && <>
        {!preview.length ? <form onSubmit={(e) => { e.preventDefault(); try { const result = previewContractorCsv(csv, rows); setPreview(result); setChosen(result.filter((r) => r.eligible).map((r) => r.key)); setError(''); } catch (cause) { setError(message(cause)); } }}>
          <p>CSV columns: name,email,status. Name and status are optional. Existing identities, names, expiry and requests are preserved. Revoked or expired accounts are shown for separate review.</p>
          <label className="field-label">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(e) => void e.target.files?.[0]?.text().then(setCsv)} /></label>
          <label className="field-label">Or paste CSV<textarea required maxLength={65536} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,email,status\nFictional person,person@example.org,active'} /></label><Button type="submit">Preview CSV</Button>
        </form> : <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
          const selectedPreview = preview.filter((r) => chosen.includes(r.key) && r.eligible);
          const decisions = selectedPreview.map((r) => ({ ...r, templateIds: overrides[r.key] ?? types }));
          if (!decisions.length || decisions.some((r) => !r.templateIds.length)) throw new Error('Select at least one eligible row and one request type for every selected contractor.');
          if (!step) { setStep(true); return; }
          await batches(creationBatches(decisions.filter((r) => !r.row).map((r) => ({ name: r.name, email: r.email, expiresAt: expiryISO(expiry), templateIds: r.templateIds }))), 'portalContractorCreate', (r, i) => `New contractor batch ${i + 1}: ${r.contractors.length} added, ${r.created} requests created.`);
          await batches(assignmentBatches(decisions.filter((r) => r.row).map((r) => ({ invitationId: r.row!.invitationId, templateIds: r.templateIds }))), 'portalRequestAssign', (r, i) => `Existing contractor batch ${i + 1}: ${r.created} requests added; ${r.unchanged} already assigned.`);
          setPreview([]); setChosen([]); setCsv(''); setStep(false); await afterSave('Bulk operation complete. Review the confirmed batch results above.');
        }); }}>
          {!step ? <><Expiry value={expiry} onChange={setExpiry} /><p>The expiry applies only to new contractors. Existing access is never restored or renewed by CSV import.</p>
            <TemplatePicker templates={catalog?.templates ?? []} value={types} onChange={setTypes} />
            <label className="field-label">Search preview<input type="search" value={previewSearch} onChange={(e) => setPreviewSearch(e.target.value)} /></label><p>{preview.length} CSV rows · {chosen.length} selected</p>
            <div className="cw-bulk-preview">{preview.filter((r) => (r.name + ' ' + r.email).toLowerCase().includes(previewSearch.toLowerCase())).map((r) => <div className="cw-bulk-row" key={r.key}><label><input type="checkbox" aria-label={'Include ' + r.email + ' row ' + r.line} disabled={!r.eligible} checked={chosen.includes(r.key)} onChange={(e) => setChosen(e.target.checked ? [...chosen, r.key] : chosen.filter((id) => id !== r.key))} /><strong>{r.name}</strong> · {r.email}</label><Badge value={r.category} /><p>Line {r.line}: {r.reason}</p>
              {r.eligible && <details><summary>Customize requests for this contractor ({(overrides[r.key] ?? types).length})</summary><TemplatePicker templates={catalog?.templates ?? []} value={overrides[r.key] ?? types} onChange={(ids) => setOverrides({ ...overrides, [r.key]: ids })} /></details>}</div>)}</div>
            <Button onClick={() => { setPreview([]); setChosen([]); setOverrides({}); }}>Change CSV</Button></> : <div className="callout"><h3>Confirm bulk changes</h3><p>{chosen.length} selected; {preview.length - chosen.length} excluded. Only new active contractors are created. Existing active contractors receive missing requests only.</p>
              <ul>{preview.filter((r) => chosen.includes(r.key)).map((r) => <li key={r.key}>{r.email}: {(overrides[r.key] ?? types).map((id) => catalog?.templates.find((t) => t.id === id)?.label).join(', ')}</li>)}</ul>
              <p>Operations run in batches of at most 50 assignments. Successful batches remain saved if a later batch fails. Refresh and preview again before retrying; existing records will not be recreated.</p></div>}
          {step && <Button disabled={busy} onClick={() => setStep(false)}>Back to preview</Button>}<Button kind="primary" type="submit" busy={busy} disabled={locked || !chosen.length}>{step ? 'Apply reviewed changes' : 'Review bulk changes'}</Button>
        </form>}
      </>}
      {dialog === 'templates' && <div className="cw-template-manager"><div><label className="field-label">Find templates<input type="search" value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} /></label><Button onClick={() => setTemplate(emptyTemplate())}>New template</Button>
        {catalog?.templates.filter((t) => t.label.toLowerCase().includes(templateSearch.toLowerCase())).map((t) => <button className="cw-template-item" key={t.id} onClick={() => setTemplate(t)}><strong>{t.label}</strong><span>{requestKinds[t.type].name} · {human(t.status)}</span></button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('portalRequestTemplate', { ...(template.id ? { id: template.id } : {}), type: template.type, label: template.label, instructions: template.instructions, maxLength: template.maxLength, status: template.status }); await refresh(); setTemplate(emptyTemplate()); setNotice('Template saved. Previously assigned labels and validation remain unchanged.'); }); }}>
          <h3>{template.id ? 'Edit template' : 'Create template'}</h3><label className="field-label">Template label<input required maxLength={80} value={template.label} onChange={(e) => setTemplate({ ...template, label: e.target.value })} /></label>
          <label className="field-label">Information type<select disabled={Boolean(template.id)} value={template.type} onChange={(e) => { const type = e.target.value as Template['type']; setTemplate({ ...template, type, maxLength: requestKinds[type].max }); }}>{Object.entries(requestKinds).map(([id, kind]) => <option key={id} value={id}>{kind.name}</option>)}</select></label>
          <label className="field-label">Instructions<textarea maxLength={1000} value={template.instructions} onChange={(e) => setTemplate({ ...template, instructions: e.target.value })} /></label>
          <p>{requestKinds[template.type].hint}</p><label className="field-label">{template.type === 'file' ? 'Maximum bytes' : 'Maximum characters'}<input type="number" required min={template.type === 'phone' ? 7 : 1} max={requestKinds[template.type].max} disabled={template.type === 'sin'} value={template.maxLength} onChange={(e) => setTemplate({ ...template, maxLength: Number(e.target.value) })} /></label>
          <label className="field-label">Template status<select value={template.status} onChange={(e) => setTemplate({ ...template, status: e.target.value })}><option value="active">Active</option><option value="archived">Archived</option></select></label>
          <p>Edits apply only to future assignments. Existing requests retain their saved label, instructions and validation.</p><Button type="submit" kind="primary" busy={busy} disabled={locked}>Save template</Button>
        </form></div>}
      {dialog === 'access' && <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
        if (!reviews.length) { const next = []; for (let i = 0; i < targets.length; i += 25) next.push(await api<Review>('portalContractorReview', { action, invitationIds: targets.slice(i, i + 25), ...(action === 'renew' ? { expiresAt: expiryISO(expiry) } : {}) })); setReviews(next); return; }
        await batches(reviews.filter((r) => r.reviewId).map((r) => ({ reviewId: r.reviewId, confirmation })), 'portalContractorApply', (r, i) => `Access batch ${i + 1}: ${r.applied.length} confirmed; ${r.skipped.length} blocked. ${r.replayed ? 'Previously applied; no further change.' : ''}`);
        setReviews([]); setConfirmation(''); await afterSave(action === 'restore' ? 'Approval restored for the confirmed records. Expiry is unchanged: review and renew expired access separately.' : action === 'renew' ? 'Confirmed invitation expiry dates renewed. Identities and all earlier records are unchanged.' : 'Confirmed accounts revoked. Existing records are preserved.');
      }); }}>
        <p>{action === 'restore' ? 'Restoring is an intentional change to revoked approval. It does not renew expiry, reset submissions or reopen consumed information.' : action === 'renew' ? 'Renew only approved active records. Revoked approval must be restored in a separate review first.' : 'Revoke future access without deleting submissions or requests.'}</p>
        {action === 'renew' && !reviews.length && <Expiry value={expiry} onChange={setExpiry} />}
        {!reviews.length ? <p>{targets.length} contractor records selected. The backend checks eligibility and authorization before preparing the review.</p> : <><ul className="cw-access-review">{reviews.flatMap((r) => r.rows).map((r) => <li key={r.invitationId}><strong>{r.name || r.email}</strong> · {r.email}<p>{human(r.accessStatus)} · existing expiry {date(r.expiresAt)} · {r.eligible ? 'Eligible' : 'Blocked'}</p><p>{r.reason}</p></li>)}</ul>
          {action === 'renew' && <p>Reviewed new expiry: {date(reviews[0]?.newExpiry ?? null)}</p>}
          <label className="field-label">Type {reviews[0]?.requiredConfirmation} to confirm<input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><p>A recent sign-in is required. Reviews expire after 10 minutes; changes to an account invalidate its review.</p></>}
        <Button type="submit" kind="primary" busy={busy} disabled={locked || reviews.length > 0 && (!reviews.some((r) => r.reviewId) || confirmation !== reviews[0].requiredConfirmation)}>{reviews.length ? 'Confirm reviewed access change' : 'Preview access change'}</Button>
        {reviews.length > 0 && <Button disabled={busy} onClick={() => { setReviews([]); setConfirmation(''); }}>Discard review</Button>}
      </form>}
    </Modal>}
  </section>;
}
function Expiry({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="field-label">Access expiry date<input type="date" required min={new Date().toISOString().slice(0, 10)} value={value} onChange={(e) => onChange(e.target.value)} /><span>New invitations default to 30 days. Choose the local calendar date access should end.</span></label>;
}
function AccessTimeline({ api, invitationId, disabled }: { api: Api; invitationId: string; disabled: boolean }) {
  const [events, setEvents] = useState<Event[]>([]), [cursor, setCursor] = useState<string | null>(null), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(next?: string) { if (disabled || busy) return; setBusy(true); try { const result = await api<{ events: Event[]; cursor: string | null }>('portalActivity', { invitationId, ...(next ? { cursor: next } : {}) }); setEvents((old) => next ? [...old, ...result.events] : result.events); setCursor(result.cursor); setLoaded(true); setError(''); } catch (cause) { setError(message(cause)); } finally { setBusy(false); } }
  return <section aria-label="Recorded contractor activity"><h4>Recorded activity</h4><p>Review recorded revocations and access changes before restoring approval. Each page searches 100 audit events; load earlier pages to look further back. An absent event does not prove why access changed.</p>
    {error && <p role="alert">{error}</p>}{!loaded && <Button disabled={disabled} busy={busy} onClick={() => void load()}>Load recorded activity</Button>}
    <ul>{events.map((event) => <li key={event.id}>{human(event.event)} · {time(event.at)} · Administrator {event.actorUid}</li>)}</ul>
    {loaded && !events.length && <p>No matching events on the searched pages.</p>}{cursor && <Button disabled={disabled} busy={busy} onClick={() => void load(cursor)}>Search earlier activity</Button>}
  </section>;
}
