import React, { useEffect, useRef, useState } from 'react';
import type { Api, Context, Overview } from './types';
import { Button, Badge } from './components';
import { message } from '../app/client';
import { normalizeAndValidate } from '../app/encryption';
import { requestKinds, validRequestValue, requestStatusLabel } from '../../functions/lib/request-types.mjs';

export type Template = { id: string; type: keyof typeof requestKinds; label: string; instructions: string; maxLength: number; status: string; revision: string };
export type Assignment = { id: string; invitationId: string; templateId: string; template: Template; status: string; submittedAt: string | null; viewedAt: string | null };
export type Catalog = { templates: Template[]; assignments: Assignment[]; filesEnabled: boolean };
const freshTemplate = () => ({ type: 'sin', label: '', instructions: '', maxLength: 24, status: 'active' }) as Template;

export function ContractorRequests({ api, signOut, legacySubmitted = false }: { api: Api; signOut: () => void; legacySubmitted?: boolean }) {
  const [requests, setRequests] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filesEnabled, setFilesEnabled] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const result = await api<{ assignments: Assignment[]; filesEnabled: boolean }>('portalRequestList');
      setRequests(result.assignments);
      setFilesEnabled(result.filesEnabled === true);
      setError('');
    } catch (error) { setError(message(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const complete = requests.filter((request) => !['pending', 'quarantined', 'cancelled'].includes(request.status)).length;
  return <div className="contractor-shell">
    <header className="public-header"><img src="/brand/mi-logo-white.png" alt="Morris Interactive" />
      <Button onClick={signOut}>Sign out</Button></header>
    <main className="requests-home">
      <p className="eyebrow">YOUR SECURE SPACE</p><h1>Your information requests</h1>
      <p>Complete each request when you’re ready. You can return later to finish the rest.</p>
      {legacySubmitted && <p>Your earlier information has already been securely received.</p>}
      {!loading && <p role="status">{complete} of {requests.filter((request) => request.status !== 'cancelled').length} securely received</p>}
      {error && <p role="alert">{error} <Button onClick={() => void refresh()}>Retry</Button></p>}
      {loading ? <p role="status">Loading your requests…</p> : requests.length === 0 ? <p>No information requests are currently assigned to you.</p> :
        <div className="request-card-grid">{requests.map((request) => <SubmissionCard key={request.id} request={request} api={api} refresh={refresh} filesEnabled={filesEnabled} />)}</div>}
    </main>
  </div>;
}
function SubmissionCard({ request, api, refresh, filesEnabled }: { request: Assignment; api: Api; refresh: () => Promise<void>; filesEnabled: boolean }) {
  const [value, setValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploadId, setUploadId] = useState<string>();
  const [uploadExpiresAt, setUploadExpiresAt] = useState<number>();
  const xhr = useRef<XMLHttpRequest | null>(null);
  const template = request.template;
  const pending = request.status === 'pending' || request.status === 'quarantined';
  useEffect(() => {
    if (!uploadId || !uploadExpiresAt || !pending) return;
    const timer = window.setTimeout(() => {
      setUploadId(undefined); setUploadExpiresAt(undefined);
      setError('The upload reservation expired. Choose the PDF again to retry securely.');
    }, Math.max(0, uploadExpiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [uploadId, uploadExpiresAt, request.status]);
  useEffect(() => {
    const clear = () => { if (document.hidden) { setValue(''); setFile(null); } };
    document.addEventListener('visibilitychange', clear);
    return () => { document.removeEventListener('visibilitychange', clear); xhr.current?.abort(); };
  }, []);
  function choose(selected?: File) {
    if (!selected) return;
    if ((selected.type !== '' && selected.type !== 'application/pdf') || !/^[^/\\\u0000-\u001f\u007f]{1,100}\.pdf$/i.test(selected.name) ||
        selected.name.length > 100 || selected.name.includes('..') || selected.size > template.maxLength || selected.size < 5) {
      setError('Choose a PDF within the request size limit.'); setFile(null); return;
    }
    setFile(selected); setUploadId(undefined); setUploadExpiresAt(undefined); setError(''); setProgress(0);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (template.type === 'file') {
        let activeUpload = uploadId;
        if (!activeUpload) {
          if (!file) throw new Error('Choose a PDF first.');
          const result = await api<{ url: string; uploadId: string; expiresAt: number }>('portalRequestUpload', {
            assignmentId: request.id, name: file.name, size: file.size, mime: 'application/pdf',
          });
          await new Promise<void>((resolve, reject) => {
            const upload = new XMLHttpRequest(); xhr.current = upload;
            upload.open('PUT', result.url);
            upload.setRequestHeader('Content-Type', 'application/pdf');
            upload.setRequestHeader('x-goog-if-generation-match', '0');
            upload.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
            upload.onload = () => upload.status >= 200 && upload.status < 300 ? resolve() : reject(new Error('Upload failed.'));
            upload.onerror = upload.onabort = () => reject(new Error('Upload interrupted.'));
            upload.timeout = 90_000;
            upload.ontimeout = () => reject(new Error('Upload timed out.'));
            upload.send(file);
          });
          activeUpload = result.uploadId;
          setUploadId(activeUpload); setUploadExpiresAt(result.expiresAt); setFile(null);
        }
        await api('portalRequestFinishUpload', { assignmentId: request.id, uploadId: activeUpload });
      } else {
        if (!validRequestValue(value, template)) throw new Error('Check the requested value.');
        const input = template.type === 'sin' ? normalizeAndValidate(value) : value;
        setValue('');
        await api('portalRequestSubmit', { assignmentId: request.id, value: input });
      }
      await refresh();
    } catch (cause) {
      setError(message(cause));
      await refresh();
    } finally { setBusy(false); }
  }
  return <section className="request-card" aria-labelledby={'request-' + request.id}>
    <div className="request-card-heading"><h2 id={'request-' + request.id}>{template.label}</h2>
      <Badge value={requestStatusLabel(request.status, template.type)} /></div>
    {template.instructions && <p>{template.instructions}</p>}
    {pending && template.type === 'file' && !filesEnabled ? <p>File upload is awaiting security approval. Your other requests can be completed now.</p> : pending ? <form onSubmit={(event) => void submit(event)}>
      {template.type === 'file' ? <>
        <label className="request-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault(); if (!busy) choose(event.dataTransfer.files[0]);
        }}>
          <span>{file ? file.name : 'Drop a PDF here, or browse files'}</span>
          <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => choose(event.target.files?.[0])} />
        </label>
        <p>PDF · maximum {Math.ceil(template.maxLength / (1024 * 1024))} MiB · checked before access</p>
        {busy && <progress aria-label="Upload progress" value={progress} max={100}>{progress}%</progress>}
      </> : <label className="field-label">{template.label}
        {template.type === 'text' ? <textarea autoComplete="off" required maxLength={template.maxLength} value={value} disabled={busy}
          onChange={(event) => setValue(event.target.value)} /> :
          <input type={template.type === 'phone' ? 'tel' : 'password'} inputMode={template.type === 'sin' ? 'numeric' : template.type === 'phone' ? 'tel' : 'text'}
            autoComplete={template.type === 'phone' ? 'tel' : 'off'} required maxLength={template.maxLength}
            value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} />}
        <span>{requestKinds[template.type].hint}</span>
      </label>}
      {error && <p role="alert">{error}</p>}
      <Button kind="primary" type="submit" busy={busy} disabled={template.type === 'file' && !file && !uploadId}>
        {uploadId ? 'Retry file check' : 'Submit securely'}</Button>
    </form> : <p>{request.status === 'cancelled' ? 'This request was cancelled.' : 'Securely received. You do not need to submit this item again.'}</p>}
  </section>;
}

export function StaffRequests({ context, api, rows, contractorId, selectedIds = [], authorizationPending = false }: {
  context: Context; api: Api; rows: Overview['rows']; contractorId?: string; selectedIds?: string[]; authorizationPending?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<Template>(freshTemplate);
  const [people, setPeople] = useState<string[]>(contractorId ? [contractorId] : selectedIds);
  const [types, setTypes] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const permissions = context.permissions ?? {};
  async function refresh() {
    const result = await api<Catalog>('portalRequestsOverview'); setCatalog(result);
  }
  useEffect(() => { if (!authorizationPending) void refresh().catch((error) => setError(message(error))); }, [authorizationPending]);
  async function run(action: () => Promise<void>) {
    if (busy || authorizationPending) return;
    setBusy(true); setError('');
    try { await action(); await refresh(); } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  const assignments = (catalog?.assignments ?? []).filter((a) => !contractorId || a.invitationId === contractorId);
  const filtered = assignments.filter((a) => (typeFilter === 'all' || a.template.type === typeFilter) &&
    (statusFilter === 'all' || a.status === statusFilter));
  return <section className="requests-workspace" aria-label="Information requests">
    <h2>{contractorId ? 'Assigned requests' : 'Information requests'}</h2>
    {error && <p role="alert">{error} <Button onClick={() => void run(refresh)}>Retry</Button></p>}
    {!catalog ? <p>Loading request workspace…</p> : <>
      {!contractorId && <div className="request-groups">{catalog.templates.map((type) => {
        const group = assignments.filter((a) => a.templateId === type.id);
        return <section key={type.id} className="request-summary"><h3>{type.label}</h3>
          <p>{group.filter((a) => ['pending', 'quarantined'].includes(a.status)).length} pending · {group.filter((a) => a.status === 'submitted').length} submitted · {group.filter((a) => ['viewed', 'removed', 'deleted'].includes(a.status)).length} completed</p>
          {permissions.invitationManagement && <Button disabled={busy} onClick={() => setTemplate(type)}>Edit template</Button>}
        </section>;
      })}</div>}
      {permissions.invitationManagement && <details open={Boolean(contractorId)}><summary>Add requests</summary>
        <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
          await api('portalRequestAssign', { invitationIds: people, templateIds: types }); setTypes([]);
        }); }}>
          {!contractorId && <label className="field-label">Contractors
            <select multiple required value={people} onChange={(event) => setPeople(Array.from(event.target.selectedOptions, (option) => option.value))}>
              {rows.filter((row) => row.invitationStatus === 'active').map((row) => <option key={row.invitationId} value={row.invitationId}>{row.name || row.email}</option>)}
            </select></label>}
          <label className="field-label">Request types
            <select multiple required value={types} onChange={(event) => setTypes(Array.from(event.target.selectedOptions, (option) => option.value))}>
              {catalog.templates.filter((type) => type.status === 'active').map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select></label>
          <p>Select one or more types. Existing assignments are preserved. Maximum 50 assignments per operation.</p>
          <Button kind="primary" type="submit" disabled={busy || authorizationPending || !people.length || !types.length}>Assign requests</Button>
        </form>
      </details>}
      {!contractorId && permissions.invitationManagement && <details open={Boolean(template.id)}><summary>{template.id ? 'Edit request type' : 'Create request type'}</summary>
        <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
          await api('portalRequestTemplate', { ...(template.id ? { id: template.id } : {}), type: template.type, label: template.label,
            instructions: template.instructions, maxLength: template.maxLength, status: template.status }); setTemplate(freshTemplate());
        }); }}>
          <label className="field-label">Label<input required maxLength={80} value={template.label} onChange={(event) => setTemplate({ ...template, label: event.target.value })} /></label>
          <label className="field-label">Type<select value={template.type} disabled={Boolean(template.id)} onChange={(event) => {
            const type = event.target.value as Template['type']; setTemplate({ ...template, type, maxLength: requestKinds[type].max });
          }}>{Object.entries(requestKinds).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></label>
          <label className="field-label">Instructions<textarea maxLength={1000} value={template.instructions} onChange={(event) => setTemplate({ ...template, instructions: event.target.value })} /></label>
          <label className="field-label">{template.type === 'file' ? 'Maximum bytes' : 'Maximum characters'}<input type="number" min={1} max={requestKinds[template.type].max} required value={template.maxLength}
            disabled={template.type === 'sin'} onChange={(event) => setTemplate({ ...template, maxLength: Number(event.target.value) })} /></label>
          <label className="field-label">Status<select value={template.status} onChange={(event) => setTemplate({ ...template, status: event.target.value })}>
            <option value="active">Active</option><option value="archived">Archived</option></select></label>
          <p>Changes apply to future assignments. Existing requests keep their original instructions and validation.</p>
          <Button type="submit" kind="primary" disabled={busy || authorizationPending}>Save request type</Button>
          {template.id && <Button onClick={() => setTemplate(freshTemplate())}>Cancel edit</Button>}
        </form>
      </details>}
      <div className="request-filters"><label>Type <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
        <option value="all">All types</option>{Object.entries(requestKinds).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></label>
        <label>Status <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>
          {['pending', 'submitted', 'viewed', 'removed', 'cancelled', 'quarantined', 'deleted', 'deleting'].map((status) => <option key={status} value={status}>{requestStatusLabel(status, '')}</option>)}
        </select></label><span>{filtered.length} requests</span></div>
      <div className="request-card-grid">{filtered.map((assignment) => <StaffRequest key={assignment.id} assignment={assignment} api={api}
        label={contractorId ? undefined : rows.find((row) => row.invitationId === assignment.invitationId)?.name}
        canManage={Boolean(permissions.invitationManagement)} canDelete={Boolean(permissions.administratorManagement)}
        authorizationPending={authorizationPending || Boolean(error)} refresh={refresh} />)}</div>
    </>}
  </section>;
}
export function StaffRequest({ assignment, api, label, canManage, canDelete, authorizationPending, refresh, filesEnabled = true }: {
  assignment: Assignment; api: Api; label?: string; canManage: boolean; canDelete: boolean; authorizationPending: boolean; refresh: () => Promise<void>; filesEnabled?: boolean;
}) {
  const [clear, setClear] = useState('');
  const [preview, setPreview] = useState('');
  const [download, setDownload] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const [notice, setNotice] = useState('');
  const epoch = useRef(0);
  const hide = () => { epoch.current++; setClear(''); setPreview(''); setDownload(''); };
  useEffect(() => {
    if (authorizationPending) hide();
    const hidden = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { epoch.current++; document.removeEventListener('visibilitychange', hidden); };
  }, [authorizationPending]);
  useEffect(() => {
    if (!clear && !preview && !download) return;
    const timer = setTimeout(hide, preview || download ? 60_000 : 30_000);
    return () => clearTimeout(timer);
  }, [clear, preview, download]);
  async function action(operation: string) {
    if (busy || authorizationPending) return;
    const version = ++epoch.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(operation, { assignmentId: assignment.id, ...(operation === 'portalRequestFileDelete' ? { confirmation: 'DELETE' } : {}) });
      if (version !== epoch.current || document.hidden) return;
      if (operation === 'portalRequestReveal') {
        if (assignment.template.type === 'sin') {
          try { await navigator.clipboard.writeText(result.value); setNotice('Copied to clipboard. This SIN cannot be retrieved again.'); }
          catch { if (version === epoch.current && !document.hidden) setClear(result.value); }
        } else setClear(result.value);
      }
      if (operation === 'portalRequestFilePreview') setPreview(result.url);
      if (operation === 'portalRequestFileDownload') setDownload(result.url);
    } catch (error) { hide(); setError(message(error)); }
    finally { setBusy(false); try { await refresh(); } catch (error) { hide(); setError(message(error)); } }
  }
  const openable = ['submitted', 'viewed'].includes(assignment.status);
  const isFile = assignment.template.type === 'file';
  return <section className="request-card" aria-label={assignment.template.label}><div className="request-card-heading"><h3>{assignment.template.label}</h3>
    <Badge value={requestStatusLabel(assignment.status, assignment.template.type)} /></div>
    {label && <p>{label}</p>}<p>{assignment.template.instructions}</p>
    {assignment.submittedAt && <p>Submitted {new Date(assignment.submittedAt).toLocaleString()}</p>}
    {clear ? <label className="field-label">Revealed value · clears after 30 seconds<textarea readOnly autoComplete="off" value={clear} onFocus={(event) => event.target.select()} /></label> :
      openable && !isFile && <p aria-label="Confidential value is masked">••••••••</p>}
    {preview && <iframe title="Document preview" src={preview} sandbox="" referrerPolicy="no-referrer" />}
    {download && <a href={download} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Download document · link expires shortly</a>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="request-actions">
      {isFile && !filesEnabled && <p>File access is disabled by the release gate. The saved file is preserved.</p>}
      {openable && (!isFile || filesEnabled) && <>
        <Button disabled={busy || authorizationPending} onClick={() => {
          if (assignment.template.type === 'sin' && !window.confirm('Reveal once and remove this SIN? A failed delivery cannot be reopened.')) return;
          void action(isFile ? 'portalRequestFilePreview' : 'portalRequestReveal');
        }}>{isFile ? 'Preview PDF' : assignment.template.type === 'sin' ? 'Reveal & Copy once' : 'Reveal value'}</Button>
        {isFile && <Button disabled={busy || authorizationPending} onClick={() => void action('portalRequestFileDownload')}>Prepare download</Button>}
      </>}
      {(clear || preview || download) && <Button onClick={hide}>Hide</Button>}
      {['pending', 'quarantined'].includes(assignment.status) && canManage && <Button disabled={busy || authorizationPending} onClick={() => void action('portalRequestCancel')}>Cancel pending request</Button>}
      {isFile && filesEnabled && canDelete && ['submitted', 'viewed', 'deleting'].includes(assignment.status) && <Button onClick={() => setRemove(true)}>Delete file…</Button>}
    </div>
    {remove && <div className="callout"><p>Delete file for request {assignment.id}? Active bytes are removed. Retained versions, backups or external copies may remain.</p>
      <Button disabled={busy || authorizationPending} onClick={() => { hide(); void action('portalRequestFileDelete'); setRemove(false); }}>Confirm delete</Button>
      <Button onClick={() => setRemove(false)}>Keep file</Button></div>}
  </section>;
}
