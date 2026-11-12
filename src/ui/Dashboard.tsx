import { ContractorsWorkspace } from './ContractorsWorkspace';
import { AdministratorAccess } from './AdministratorAccess';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  filterRows,
  sortRows,
  META_COLUMNS,
} from '../../functions/lib/metadata.mjs';
import { emailLocalPart, parseAllowlistCsv } from '../../functions/lib/csv.mjs';
import { message } from '../app/client';
import { bucketFieldTypes } from '../../functions/lib/bucket-field.mjs';
import type { Api, Context, Overview, Row, Event, BucketField } from './types';
import {
  Badge,
  Button,
  Help,
  Icon,
  Modal,
  Empty,
  Skeleton,
  human,
  date,
  time,
} from './components';
const defaults = [
  'name',
  'email',
  'invitationAt',
  'provider',
  'invitationStatus',
  'submissionStatus',
  'retrievalStatus',
  'transferStatus',
  'disposalStatus',
];
const metricList = [
  ['total', 'Total invited', 'people'],
  ['pending', 'Pending invitations', 'clock'],
  ['signedIn', 'Signed in', 'check'],
  ['submitted', 'Submissions received', 'file'],
  ['awaitingRetrieval', 'Awaiting retrieval', 'lock'],
  ['retrieved', 'Retrieved', 'eye'],
  ['transferred', 'Transferred', 'arrow'],
  ['disposed', 'Disposed', 'burn'],
  ['revoked', 'Revoked', 'alert'],
  ['attention', 'Needs attention', 'alert'],
] as const;
export default function Dashboard({
  context,
  api,
  notify,
  signOut,
  authorizationPending = false,
}: {
  context: Context;
  api: Api;
  notify: (s: string, error?: boolean) => void;
  signOut: () => void;
  authorizationPending?: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null),
    drawerRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<Overview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(context.requestsV2 ? 'contractors' : 'overview'),
    [mobile, setMobile] = useState(false);
  const [filter, setFilter] = useState<Record<string, string>>({
      search: '',
      status: 'all',
      provider: 'all',
      admin: 'all',
      action: 'all',
      from: '',
      to: '',
    }),
    [advanced, setAdvanced] = useState(false),
    [sort, setSort] = useState('name'),
    [direction, setDirection] = useState('asc'),
    [requestedPage, setPage] = useState(1),
    [size, setSize] = useState(10),
    [selected, setSelected] = useState<string[]>([]),
    [columns, setColumns] = useState(() => context.liveSin ? defaults.filter((field) => !['transferStatus', 'disposalStatus'].includes(field)) : defaults),
    [columnModal, setColumnModal] = useState(false);
  const [drawer, setDrawer] = useState<Row | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [auditFilter, setAuditFilter] = useState<Record<string, string>>({
      actor: '',
      event: '',
      from: '',
      to: '',
    }),
    [auditLoading, setAuditLoading] = useState(false);
  const [dialog, setDialog] = useState<{
      kind: string;
      row?: Row;
      ids?: string[];
    } | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [outputScope, setOutputScope] = useState('filtered'),
    [exportFields, setExportFields] = useState(defaults),
    [copied, setCopied] = useState('');
  const [csv, setCsv] = useState(''),
    [csvPreview, setCsvPreview] = useState<
      { name: string; email: string; status: string }[]
    >([]),
    [addName, setAddName] = useState(''),
    [addEmail, setAddEmail] = useState('');
  const permissions = context.permissions || {};
  const [requestProgress, setRequestProgress] = useState<Record<string, string>>({});
  const [bucketField, setBucketField] = useState(context.bucketField);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [revealed, setRevealed] = useState('');
  const [revealError, setRevealError] = useState('');
  const revealActive = useRef(false);
  useEffect(() => {
    if (authorizationPending) {
      revealActive.current = false;
      setRevealed('');
    }
  }, [authorizationPending]);
  useEffect(() => {
    const clear = () => {
      if (document.hidden) {
        revealActive.current = false;
        setRevealed('');
      }
    };
    document.addEventListener('visibilitychange', clear);
    return () => {
      document.removeEventListener('visibilitychange', clear);
      revealActive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(''), 30000);
    return () => clearTimeout(timer);
  }, [revealed]);

  async function revealOnce(id: string) {
    if (busy || authorizationPending || revealActive.current) return;
    revealActive.current = true;
    setBusy(true);
    setRevealError('');
    try {
      const { value } = await api<{ value: string }>('portalBucketReveal', { invitationId: id });
      if (!revealActive.current || document.hidden) {
        setRevealError('The one-time reveal was consumed while this page was hidden.');
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        notify('Value copied. It cannot be revealed again.');
        setDialog(null);
      } catch {
        if (revealActive.current && !document.hidden) {
          setRevealError('The one-time reveal has been consumed.');
          setRevealed(value);
        }
      }
    } catch (error) {
      setRevealError(message(error) + ' Refresh the record to check whether the reveal was consumed.');
    } finally {
      revealActive.current = false;
      setBusy(false);
      await load();
    }
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const old = document.activeElement as HTMLElement,
      d = drawerRef.current;
    d?.querySelector<HTMLElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawer(null);
      }
      if (e.key === 'Tab' && d) {
        const list = [
          ...d.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,[tabindex="0"]',
          ),
        ];
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      old?.focus();
    };
  }, [drawer?.invitationId]);
  async function load(initial = false) {
    if (authorizationPending) return;
    if (initial) setLoading(true);
    setError('');
    try {
      const fresh = await api<Overview>('portalOverview');
      setData(fresh);
      setDrawer((old) =>
        old
          ? fresh.rows.find((r) => r.invitationId === old.invitationId) || null
          : null,
      );
    } catch {
      setError(
        'The dashboard could not be loaded. Your role may have changed, or the service may be unavailable.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);
  const filtered = useMemo(
    () => sortRows(filterRows(data?.rows || [], filter), sort, direction),
    [data, filter, sort, direction],
  );
  const maxPage = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(requestedPage, maxPage);
  const visible = filtered.slice((page - 1) * size, page * size);
  useEffect(() => {
    if (requestedPage !== page) setPage(page);
  }, [requestedPage, page]);
  function updateFilter(key: string, value: string) {
    setFilter({ ...filter, [key]: value });
    setPage(1);
    setSelected([]);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      notify(
        'The action was not completed. Your permission, session or connection may have changed.',
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  async function audit(row?: Row, more = false) {
    setAuditLoading(true);
    try {
      const result = await api<{ events: Event[]; cursor: string | null }>(
        'portalActivity',
        {
          ...Object.fromEntries(
            Object.entries(auditFilter).filter(([, v]) => v),
          ),
          ...(row ? { invitationId: row.invitationId } : {}),
          ...(more && cursor ? { cursor } : {}),
        },
      );
      setEvents((old) => (more ? [...old, ...result.events] : result.events));
      setCursor(result.cursor);
    } catch {
      notify(
        'Activity is unavailable for your current role or connection.',
        true,
      );
    } finally {
      setAuditLoading(false);
    }
  }
  useEffect(() => {
    if (tab === 'activity' && permissions.auditViewing) void audit();
  }, [tab, auditFilter]);
  function openRow(row: Row) {
    setDrawer(row);
    setEvents([]);
    setCursor(null);
    if (permissions.auditViewing) void audit(row);
  }
  async function acknowledge(id: string, outcome: string) {
    try {
      await api('portalOutputAck', { outputId: id, outcome });
      return true;
    } catch {
      return false;
    }
  }
  async function copy(
    scope: string,
    ids?: string[],
    fields = columns,
    key = 'bulk',
  ) {
    await action(async () => {
      const result = await api<{
        text: string;
        outputId: string;
        count: number;
      }>('portalMetadataOutput', {
        kind: 'copy',
        scope,
        fields,
        ...(ids ? { ids } : {}),
        ...(scope === 'one' ? {} : { filter, sort, direction }),
      });
      try {
        if (!navigator.clipboard?.writeText) throw Error();
        await navigator.clipboard.writeText(result.text);
      } catch {
        await acknowledge(result.outputId, 'client_failed');
        notify(
          'Clipboard access failed. No successful copy was recorded. Check browser permissions and retry.',
          true,
        );
        return;
      }
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
      const recorded = await acknowledge(result.outputId, 'client_confirmed');
      notify(
        `Copied ${result.count} ${result.count === 1 ? 'record' : 'records'} to clipboard.${recorded ? '' : ' Copy succeeded; audit acknowledgment could not be recorded.'}`,
      );
    });
  }
  async function exportFile() {
    await action(async () => {
      const result = await api<{
        base64: string;
        fileName: string;
        outputId: string;
        count: number;
      }>('portalMetadataOutput', {
        kind: 'xlsx',
        scope: outputScope,
        fields: exportFields,
        ...(outputScope === 'selected' ? { ids: selected } : {}),
        ...(outputScope === 'all' ? {} : { filter, sort, direction }),
      });
      try {
        const bytes = Uint8Array.from(atob(result.base64), (c) =>
            c.charCodeAt(0),
          ),
          url = URL.createObjectURL(
            new Blob([bytes], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
          ),
          a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch {
        await acknowledge(result.outputId, 'client_failed');
        notify(
          'The workbook was prepared but the download could not be started.',
          true,
        );
        return;
      }
      const recorded = await acknowledge(result.outputId, 'client_confirmed');
      setDialog(null);
      notify(
        `Download started for ${result.count} metadata records.${recorded ? '' : ' Audit acknowledgment is pending.'} Check your browser downloads.`,
      );
    });
  }
  async function executeDialog() {
    if (!dialog) return;
    await action(async () => {
      if (dialog.kind === 'revoke' || dialog.kind === 'assign_self') {
        const result = await api<{ updated: number }>('portalBulkAction', {
          action: dialog.kind,
          ids: dialog.ids,
        });
        notify(
          `${result.updated} ${result.updated === 1 ? 'record updated' : 'records updated'}.`,
        );
        setSelected([]);
      } else if (dialog.kind === 'correction') {
        await api('portalRequestCorrection', {
          invitationId: dialog.row!.invitationId,
        });
        notify(
          'Correction requested. Access is revoked and the consumed submission slot is preserved.',
        );
      } else {
        const result = await api<{ message: string; auditReference: string }>(
          'portalWorkflowRequest',
          { kind: dialog.kind, invitationId: dialog.row!.invitationId },
        );
        notify(result.message);
      }
      setDialog(null);
      setConfirmed(false);
      await load();
      if (drawer && permissions.auditViewing) await audit(drawer);
    });
  }
  const [dedicatedTesters, setDedicatedTesters] = useState(false);
  useEffect(() => {
    if (!dialog) setDedicatedTesters(false);
  }, [dialog]);
  async function importList(text: string, mode: 'create' | 'rename' = 'create') {
    if (context.workspace !== 'staff' && dedicatedTesters && permissions.administratorManagement) {
      await api('portalImportDedicatedTesters', { csv: text, confirmed: true });
    } else {
      await api('portalImportAllowlist', { csv: text, ...(mode === 'rename' ? { mode } : {}) });
    }
    setDedicatedTesters(false);
    setCsv('');
    setCsvPreview([]);
    setDialog(null);
    notify(
      'The backend confirmed the approved-list update. Existing submission slots were preserved.',
    );
    await load();
  }
  async function readCsv(file?: File) {
    if (!file) return;
    if (file.size > 65536) {
      notify('Choose a CSV smaller than 64 KiB.', true);
      return;
    }
    try {
      const text = await file.text().catch(() => { throw new Error('The CSV file could not be read.'); });
      const rows = parseAllowlistCsv(text);
      setCsv(text);
      setCsvPreview(rows);
      setDialog({ kind: 'import' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The CSV file could not be read.', true);
    }
  }
  const countForExport =
    outputScope === 'all'
      ? data?.rows.length || 0
      : outputScope === 'selected'
        ? selected.length
        : filtered.length;
  const copyButton = (row: Row, field: string) => (
    <Button
      icon={copied === `${row.invitationId}-${field}` ? 'check' : 'copy'}
      title={
        permissions.metadataCopy
          ? `Copy ${human(field)} only`
          : 'Metadata copy permission is not assigned'
      }
      disabled={!permissions.metadataCopy || busy}
      onClick={() =>
        void copy(
          'one',
          [row.invitationId],
          [field],
          `${row.invitationId}-${field}`,
        )
      }
      className="tiny"
    />
  );
  function cell(row: Row, field: string) {
    const value = (row as unknown as Record<string, any>)[field];
    if (field === 'name')
      return (
        <div className="name-cell">
          <span className="avatar">
            {(row.name || row.email)
              .split(/[ .@]/)
              .slice(0, 2)
              .map((w) => w[0])
              .join('')
              .toUpperCase()}
          </span>
          <div>
            <button className="record-link" onClick={() => openRow(row)}>
              {row.name?.trim() || emailLocalPart(row.email)}
            </button>
            <small>{row.reference.slice(0, 8).toUpperCase()}</small>
          </div>
          {copyButton(row, field)}
        </div>
      );
    if (field === 'email')
      return (
        <div className="copy-cell">
          <span>{value}</span>
          {copyButton(row, field)}
        </div>
      );
    if (field.endsWith('At'))
      return <span className={!value ? 'muted' : ''}>{date(value)}</span>;
    if (field === 'submissionStatus' && context.liveSin && row.retrievalStatus === 'retrieved')
      return <Badge value="Retrieved / Removed" />;
    if (field.endsWith('Status')) return <Badge value={value} />;
    if (field === 'provider')
      return (
        <span className="provider">
          {value === 'microsoft.com' ? (
            <span className="ms-symbol">▦</span>
          ) : value === 'google.com' ? (
            <b>G</b>
          ) : (
            <Icon name="clock" size={15} />
          )}{' '}
          {human(value)}
        </span>
      );
    return <span>{value ? human(String(value)) : 'Not recorded'}</span>;
  }
  return (
    <div className="workspace">
      <a href="#dashboard-main" className="skip">
        Skip to dashboard
      </a>
      <aside
        inert={drawer ? true : undefined}
        className={`sidebar ${mobile ? 'open' : ''}`}
      >
        <div className="sidebar-brand">
          <img
            src="/brand/mi-logo-white.png"
            alt="Morris Interactive · it starts with people"
          />
          <span>SECURE COLLECTION</span>
        </div>
        <div className="workspace-label">
          WORKSPACE <span className="environment-dot">{context.workspace === 'staff' ? 'Staff' : 'Synthetic'}</span>
        </div>
        <nav aria-label="Administration">
          {[
            ['overview', 'grid', 'Overview'],
            ['contractors', 'people', context.requestsV2 ? 'Contractors & requests' : 'Contractors'],
            ['activity', 'activity', 'Activity'],
            ['security', 'shield', 'Security & handling'],
          ].map(([key, icon, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => {
                setTab(key);
                setMobile(false);
              }}
            >
              <Icon name={icon as any} />
              {label}
              {key === 'contractors' && data && (
                <span className="nav-count">{data.rows.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="shield" />
          <strong>Privacy by design</strong>
          <p>
            Only administrative metadata appears here. SIN digits stay out of
            your workspace.
          </p>
          <button onClick={() => setTab('security')}>
            View security controls <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="sidebar-user">
          <span className="avatar admin-avatar">MI</span>
          <div>
            <strong>{context.displayLabel || 'MI administrator'}</strong>
            <small>Microsoft organization</small>
          </div>
          <Button
            icon="logout"
            title="Sign out and clear this session"
            onClick={signOut}
          />
        </div>
      </aside>
      <div className="workspace-body" inert={drawer ? true : undefined}>
        <header className="topbar">
          <div>
            <Button
              icon="menu"
              title="Open workspace navigation"
              className="mobile-menu"
              onClick={() => setMobile(!mobile)}
            />
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <strong>
              {tab === 'overview'
                ? 'Overview'
                : tab === 'contractors'
                  ? 'Contractors'
                  : tab === 'activity'
                    ? 'Activity'
                    : 'Security & handling'}
            </strong>
          </div>
          <div>
            <span className="secure-label">
              <Icon name="lock" size={13} />
              Restricted workspace
            </span>
            <span className="test-label">{context.requestsV2 ? 'INFORMATION REQUESTS' : context.liveSin ? 'SECURE COLLECTION' : context.workspace === 'staff' ? 'COLLECTION CLOSED' : 'SYNTHETIC TEST'}</span>
          </div>
        </header>
        <main id="dashboard-main" className="dashboard-main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MORRIS INTERACTIVE / SECURE SIN PORTAL</p>
              <h1>
                {tab === 'overview'
                  ? 'A clear view of every invitation.'
                  : tab === 'contractors'
                    ? context.requestsV2 ? 'Contractors & requests.' : 'Contractor workspace.'
                    : tab === 'requests'
                      ? 'Information requests.'
                    : tab === 'activity'
                      ? 'Every action, accounted for.'
                      : 'Built around careful handling.'}
              </h1>
              <p>
                {tab === 'activity'
                  ? 'Review server-generated events, without sensitive submission content.'
                  : tab === 'security'
                    ? 'Understand the safeguards, responsibilities and steps that stay restricted.'
                    : 'Follow the collection journey. Keep personal information protected.'}
              </p>
            </div>
            <div className="heading-actions">
              <Button
                icon="refresh"
                title="Refresh statuses from the backend"
                busy={loading}
                disabled={busy || authorizationPending}
                onClick={() => void load()}
              >
                Refresh
              </Button>
              {!context.requestsV2 && <Button
                kind="primary"
                icon="plus"
                title={
                  permissions.invitationManagement
                    ? 'Add or import operator-approved test identities'
                    : 'Invitation management permission is not assigned'
                }
                disabled={!permissions.invitationManagement || busy}
                onClick={() => {
                  setAddName('');
                  setAddEmail('');
                  setDialog({ kind: 'add' });
                }}
              >
                Add contractor
              </Button>}
            </div>
          </div>
          {error ? (
            <div role="alert" className="error-panel">
              <Icon name="alert" />
              <div>
                <strong>We couldn’t refresh the workspace.</strong>
                <p>{error}</p>
              </div>
              <Button onClick={() => void load(true)}>Try again</Button>
            </div>
          ) : loading ? (
            <Skeleton />
          ) : (
            data && (
              <>
                {tab === 'overview' && (
                  <>
                    <div className="status-strip">
                      <span>
                        <i />
                        {context.liveSin ? 'Connected to secure information collection' : context.workspace === 'staff' ? 'Connected to staff invitation metadata' : 'Connected to the synthetic collection workflow'}
                      </span>
                      <span>
                        Updated {time(data.generatedAt)}{' '}
                        <span className="dot-separator">·</span>{' '}
                        Backend-confirmed metadata
                      </span>
                    </div>
                    <div className="metrics-grid">
                      {metricList.filter(([key]) => !context.liveSin || !['transferred', 'disposed'].includes(key)).map(([key, label, icon], i) => (
                        <Help
                          key={key}
                          text={`${label}: ${data.metrics[key] || 0} backend records. ${!context.liveSin && ['retrieved', 'transferred', 'disposed'].includes(key) ? 'This production step remains restricted.' : 'Refresh to retrieve the latest count.'}`}
                        >
                          <div
                            className={`metric-card ${i === 0 ? 'lead' : ''}`}
                          >
                            <div>
                              <span>{label}</span>
                              <Icon name={icon} />
                            </div>
                            <strong
                              key={data.metrics[key]}
                              className="metric-value"
                            >
                              {data.metrics[key] ?? 0}
                            </strong>
                            <small>
                              {key === 'total'
                                ? 'Approved list, all statuses'
                                : key === 'submitted'
                                  ? context.workspace === 'staff' ? 'Submission metadata only' : 'Encrypted synthetic fixtures'
                                  : [
                                        'retrieved',
                                        'transferred',
                                        'disposed',
                                      ].includes(key)
                                    ? 'Approval-gated workflow'
                                    : 'Current recorded state'}
                            </small>
                          </div>
                        </Help>
                      ))}
                    </div>
                    <div className="journey-panel">
                      <div>
                        <span className="eyebrow">COLLECTION JOURNEY</span>
                        <h2>Progress, with clear boundaries.</h2>
                      </div>
                      <div className="journey-stages">
                        {[
                          ['Invited', data.metrics.total],
                          ['Signed in', data.metrics.signedIn],
                          ['Submitted', data.metrics.submitted],
                          ['Transferred', data.metrics.transferred],
                          ['Disposed', data.metrics.disposed],
                        ].map(([label, n], i) => (
                          <div key={label}>
                            <span
                              className={
                                i < 3 ? 'stage-icon' : 'stage-icon locked'
                              }
                            >
                              <Icon name={i < 3 ? 'check' : 'lock'} size={14} />
                            </span>
                            <strong>{n}</strong>
                            <small>{label}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {!context.requestsV2 && (tab === 'overview' || tab === 'contractors') && (
                  <section className="data-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Contractor tracker{' '}
                          <span className="count-pill">{data.rows.length}</span>
                        </h2>
                        <p>
                          Invitation and submission progress. No SIN digits.
                        </p>
                      </div>
                      <div className="toolbar-actions">
                        <Button
                          icon="copy"
                          title={`Copy metadata from all ${filtered.length} filtered records using the visible columns`}
                          disabled={
                            !permissions.metadataCopy ||
                            !filtered.length ||
                            busy
                          }
                          onClick={() => void copy('filtered')}
                        >
                          Copy all filtered ({filtered.length})
                        </Button>
                        <Button
                          icon="download"
                          title={
                            permissions.metadataExport
                              ? 'Export approved metadata only. A server audit event is required.'
                              : 'Metadata export permission is not assigned'
                          }
                          disabled={!permissions.metadataExport || busy}
                          onClick={() => {
                            setExportFields(columns);
                            setOutputScope('filtered');
                            setDialog({ kind: 'export' });
                          }}
                        >
                          Export Excel
                        </Button>
                      </div>
                    </div>
                    <div className="table-toolbar">
                      <label className="search">
                        <Icon name="search" />
                        <input
                          ref={searchRef}
                          aria-label="Search contractor metadata"
                          placeholder="Search name, email or reference…"
                          value={filter.search}
                          onChange={(e) =>
                            updateFilter('search', e.target.value)
                          }
                        />
                        <kbd>/</kbd>
                      </label>
                      <Help text="Filter by the recorded submission status">
                        <select
                          aria-label="Submission status filter"
                          value={filter.status}
                          onChange={(e) =>
                            updateFilter('status', e.target.value)
                          }
                        >
                          <option value="all">All submissions</option>
                          <option value="pending">Pending</option>
                          <option value="submitted">Submitted</option>
                          <option value="correction_requested">
                            Correction requested
                          </option>
                        </select>
                      </Help>
                      <Button
                        icon="filter"
                        title="Show date, provider, administrator and pending-action filters"
                        onClick={() => setAdvanced(!advanced)}
                      >
                        Filters{advanced ? ' −' : ' +'}
                      </Button>
                      <Button
                        icon="grid"
                        title="Choose exactly which metadata columns are visible and copied"
                        onClick={() => setColumnModal(true)}
                      >
                        Columns
                      </Button>
                    </div>
                    {advanced && (
                      <div className="advanced-filters">
                        <label>
                          Provider
                          <select
                            value={filter.provider}
                            onChange={(e) =>
                              updateFilter('provider', e.target.value)
                            }
                          >
                            <option value="all">All providers</option>
                            <option value="microsoft.com">Microsoft</option>
                            <option value="google.com">Google</option>
                            <option value="not_recorded">Not recorded</option>
                          </select>
                        </label>
                        <label>
                          Administrator
                          <select
                            value={filter.admin}
                            onChange={(e) =>
                              updateFilter('admin', e.target.value)
                            }
                          >
                            <option value="all">All administrators</option>
                            {data.adminDirectory.map((a) => (
                              <option key={a.uid} value={a.uid}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Pending action
                          <select
                            value={filter.action}
                            onChange={(e) =>
                              updateFilter('action', e.target.value)
                            }
                          >
                            <option value="all">All actions</option>
                            <option value="retrieval">
                              Awaiting retrieval
                            </option>
                            <option value="attention">Needs attention</option>
                          </select>
                        </label>
                        <label>
                          Invited from
                          <input
                            type="date"
                            value={filter.from}
                            onChange={(e) =>
                              updateFilter('from', e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Invited to
                          <input
                            type="date"
                            value={filter.to}
                            onChange={(e) => updateFilter('to', e.target.value)}
                          />
                        </label>
                        <Button
                          title="Clear every search and filter"
                          onClick={() => {
                            setFilter({
                              search: '',
                              status: 'all',
                              provider: 'all',
                              admin: 'all',
                              action: 'all',
                              from: '',
                              to: '',
                            });
                            setPage(1);
                            setSelected([]);
                          }}
                        >
                          Reset filters
                        </Button>
                      </div>
                    )}
                    {selected.length > 0 && (
                      <div className="selection-bar">
                        <strong>{selected.length} selected</strong>
                        <Button
                          icon="copy"
                          title={`Copy exactly ${selected.length} selected metadata records`}
                          disabled={!permissions.metadataCopy || busy}
                          onClick={() => void copy('selected', selected)}
                        >
                          Copy selected ({selected.length})
                        </Button>
                        <Button
                          icon="download"
                          title="Export selected rows as a metadata-only workbook"
                          disabled={!permissions.metadataExport || busy}
                          onClick={() => {
                            setOutputScope('selected');
                            setExportFields(columns);
                            setDialog({ kind: 'export' });
                          }}
                        >
                          Export selected
                        </Button>
                        {context.requestsV2 && <Button onClick={() => setTab('requests')}>Add requests to selected</Button>}
                        <Button
                          title="Assign these records to the signed-in administrator"
                          disabled={
                            !permissions.invitationManagement ||
                            selected.length > 25 ||
                            busy
                          }
                          onClick={() => {
                            setConfirmed(false);
                            setDialog({ kind: 'assign_self', ids: selected });
                          }}
                        >
                          Assign to me
                        </Button>
                        <Button
                          kind="danger-ghost"
                          title={
                            selected.length > 25
                              ? 'Select at most 25 invitations per revoke operation'
                              : 'Revoke selected invitations without deleting their submissions'
                          }
                          disabled={
                            !permissions.invitationManagement ||
                            selected.length > 25 ||
                            busy
                          }
                          onClick={() => {
                            setConfirmed(false);
                            setDialog({ kind: 'revoke', ids: selected });
                          }}
                        >
                          Revoke
                        </Button>
                        <button
                          className="text-link"
                          onClick={() => setSelected([])}
                        >
                          Clear selection
                        </button>
                      </div>
                    )}
                    {filtered.length ? (
                      <div
                        className="table-scroll"
                        role="region"
                        aria-label="Contractor tracking table"
                        tabIndex={0}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th className="select-cell">
                                <input
                                  type="checkbox"
                                  aria-label={`Select visible page of ${visible.length} records`}
                                  checked={
                                    visible.length > 0 &&
                                    visible.every((r) =>
                                      selected.includes(r.invitationId),
                                    )
                                  }
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? [
                                            ...new Set([
                                              ...selected,
                                              ...visible.map(
                                                (r) => r.invitationId,
                                              ),
                                            ]),
                                          ]
                                        : selected.filter(
                                            (id) =>
                                              !visible.some(
                                                (r) => r.invitationId === id,
                                              ),
                                          ),
                                    )
                                  }
                                />
                              </th>
                              {columns.map((field) => {
                                const label = context.requestsV2 && field === 'submissionStatus' ? 'Legacy submission status' : META_COLUMNS.find(([key]) => key === field)?.[1];
                                return <th key={field}
                                  aria-sort={sort === field ? direction === 'asc' ? 'ascending' : 'descending' : undefined}>
                                  <div className="tracker-column-heading">
                                    <button type="button" onClick={() => {
                                      setSort(field);
                                      setDirection(sort === field && direction === 'asc' ? 'desc' : 'asc');
                                    }}>
                                      {label}<Icon name="sort" size={12} />
                                    </button>
                                    <Help text={`Sort by ${label}. Historical missing values are left blank.`} />
                                  </div>
                                </th>;
                              })}
                              {context.requestsV2 && <th>Assigned requests</th>}
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((row) => (
                              <tr
                                key={row.invitationId}
                                className={
                                  selected.includes(row.invitationId)
                                    ? 'selected'
                                    : ''
                                }
                              >
                                <td className="select-cell">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${row.name || row.email}`}
                                    checked={selected.includes(
                                      row.invitationId,
                                    )}
                                    onChange={(e) =>
                                      setSelected(
                                        e.target.checked
                                          ? [...selected, row.invitationId]
                                          : selected.filter(
                                              (id) => id !== row.invitationId,
                                            ),
                                      )
                                    }
                                  />
                                </td>
                                {columns.map((field) => (
                                  <td key={field}>{cell(row, field)}</td>
                                ))}
                                {context.requestsV2 && <td>{requestProgress[row.invitationId]}</td>}
                                <td>
                                  <Button
                                    icon="chevron"
                                    title={`View details and permitted actions for ${row.name || 'this record'}`}
                                    onClick={() => openRow(row)}
                                    className="tiny"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        title={
                          data.rows.length
                            ? 'No matching contractors'
                            : 'Your workspace is ready'
                        }
                      >
                        {data.rows.length
                          ? 'Try a different search or reset your filters.'
                          : 'Add an operator-approved test identity to begin tracking invitations.'}
                      </Empty>
                    )}
                    <div className="table-footer">
                      <span>
                        {filtered.length
                          ? `${(page - 1) * size + 1}–${Math.min(page * size, filtered.length)}`
                          : '0'}{' '}
                        of {filtered.length} filtered records{' '}
                        <span className="muted">
                          ({data.rows.length} authorized)
                        </span>
                      </span>
                      <div>
                        <Button
                          icon="copy"
                          title={`Copy just the ${visible.length} rows on this visible page`}
                          disabled={
                            !permissions.metadataCopy || !visible.length || busy
                          }
                          onClick={() =>
                            void copy(
                              'visible',
                              visible.map((r) => r.invitationId),
                            )
                          }
                        >
                          Copy visible page ({visible.length})
                        </Button>
                        <label className="page-size">
                          Rows
                          <select
                            aria-label="Rows per page"
                            value={size}
                            onChange={(e) => {
                              setSize(Number(e.target.value));
                              setPage(1);
                            }}
                          >
                            {[10, 20, 50].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className="btn secondary"
                          aria-label="Previous page" disabled={page <= 1}
                          onClick={() => setPage(page - 1)}>
                          ←
                        </button>
                        <span>
                          {page} / {maxPage}
                        </span>
                        <button type="button" className="btn secondary"
                          aria-label="Next page" disabled={page >= maxPage}
                          onClick={() => setPage(page + 1)}>
                          →
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                {(tab === 'contractors' || tab === 'overview') && context.requestsV2 && <ContractorsWorkspace context={context} api={api} rows={data.rows}
                  refreshRows={() => load()} authorizationPending={authorizationPending} openLegacy={openRow}
                  copyMetadata={(ids) => void copy('selected', ids)} exportMetadata={(ids) => { setSelected(ids); setOutputScope('selected'); setExportFields(columns); setDialog({ kind: 'export' }); }} />}
                {tab === 'activity' && (
                  <section className="data-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Administrative activity</h2>
                        <p>
                          Server events. Clipboard and download completion are
                          explicitly client-reported.
                        </p>
                      </div>
                      <Button
                        icon="refresh"
                        title="Reload server-generated audit events"
                        onClick={() => void audit()}
                        busy={auditLoading}
                      >
                        Refresh
                      </Button>
                    </div>
                    {permissions.auditViewing ? (
                      <>
                        <div className="advanced-filters always">
                          <label>
                            Contractor
                            <select
                              value={auditFilter.invitationId || ''}
                              onChange={(e) =>
                                setAuditFilter({
                                  ...auditFilter,
                                  invitationId: e.target.value,
                                })
                              }
                            >
                              <option value="">All contractors</option>
                              {data.rows.map((r) => (
                                <option
                                  key={r.invitationId}
                                  value={r.invitationId}
                                >
                                  {r.name || r.email}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Administrator
                            <select
                              value={auditFilter.actor}
                              onChange={(e) =>
                                setAuditFilter({
                                  ...auditFilter,
                                  actor: e.target.value,
                                })
                              }
                            >
                              <option value="">All administrators</option>
                              {data.adminDirectory.map((a) => (
                                <option key={a.uid} value={a.uid}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Event
                            <select
                              value={auditFilter.event}
                              onChange={(e) =>
                                setAuditFilter({
                                  ...auditFilter,
                                  event: e.target.value,
                                })
                              }
                            >
                              <option value="">All event types</option>
                              {[
                                'invitation_created',
                                'invitation_updated',
                                'invitation_revoked',
                                'invitation_removed',
                                'administrator_assigned',
                                'submission_accepted',
                                'contractor_signed_in',
                                'correction_requested',
                                'metadata_copy_prepared',
                                'metadata_copy_client_confirmed',
                                'metadata_copy_client_failed',
                                'metadata_export_prepared',
                                'metadata_export_client_confirmed',
                                'metadata_export_client_failed',
                                'retrieval_request_blocked',
                                'transfer_request_blocked',
                                'burn_request_blocked',
                                'administrator_permissions_changed',
                                'administrator_revoked',
                              ].map((v) => (
                                <option key={v} value={v}>
                                  {human(v)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            From
                            <input
                              type="date"
                              value={auditFilter.from}
                              onChange={(e) =>
                                setAuditFilter({
                                  ...auditFilter,
                                  from: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            To
                            <input
                              type="date"
                              value={auditFilter.to}
                              onChange={(e) =>
                                setAuditFilter({
                                  ...auditFilter,
                                  to: e.target.value,
                                })
                              }
                            />
                          </label>
                          <Button
                            onClick={() =>
                              setAuditFilter({
                                actor: '',
                                event: '',
                                from: '',
                                to: '',
                              })
                            }
                          >
                            Reset
                          </Button>
                        </div>
                        <>
                          {auditLoading && !events.length ? (
                            <p role="status" className="activity-loading">
                              <span className="spinner" /> Loading server
                              activity…
                            </p>
                          ) : (
                            <Timeline
                              events={events}
                              directory={data.adminDirectory}
                            />
                          )}
                        </>
                        <div className="activity-footer">
                          <span>
                            Filters apply to each scanned page of 100 server
                            events. Load earlier pages to continue.
                          </span>
                          {cursor && (
                            <Button
                              onClick={() => void audit(undefined, true)}
                              busy={auditLoading}
                            >
                              Load earlier activity
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <Empty title="Audit viewing is restricted">
                        Your role does not include access to administrative
                        activity.
                      </Empty>
                    )}
                  </section>
                )}
                {tab === 'security' && (
                  <div className="security-grid">
                    {bucketField && !context.requestsV2 && permissions.invitationManagement && <section className="data-panel security-card">
                      <h2>Requested information</h2>
                      <form onSubmit={(event) => {
                        event.preventDefault();
                        if (fieldSaving) return;
                        setFieldSaving(true);
                        void api<BucketField>('portalBucketConfigure', { label: bucketField.label, type: bucketField.type })
                          .then((field) => { setBucketField(field); notify('Requested field saved.'); })
                          .catch((error) => notify(message(error), true))
                          .finally(() => setFieldSaving(false));
                      }}>
                        <label className="field-label">Field label
                          <input required maxLength={80} disabled={fieldSaving} value={bucketField.label}
                            onChange={(event) => setBucketField({ ...bucketField, label: event.target.value })} />
                        </label>
                        <label className="field-label">Input type
                          <select disabled={fieldSaving} value={bucketField.type}
                            onChange={(event) => setBucketField({ ...bucketField, type: event.target.value as BucketField['type'] })}>
                            {Object.entries(bucketFieldTypes).map(([type, format]) => <option key={type} value={type}>{format.name}</option>)}
                          </select>
                        </label>
                        <Button type="submit" kind="primary" disabled={fieldSaving}>Save requested field</Button>
                      </form>
                    </section>}
                    {permissions.administratorManagement && <AdministratorAccess api={api} signOut={signOut} permanent={context.workspace === 'staff'} />}
                    <section className="data-panel security-card">
                      <Icon name="shield" size={30} />
                      <h2>A small surface for sensitive work.</h2>
                      <p>
                        Only fixed synthetic fixtures can be accepted in this
                        release. The named database rejects direct browser reads
                        and writes. Enterprise App Check and signed identity
                        verification protect the dedicated backend.
                      </p>
                      <ul>
                        <li>
                          No SIN digits in tables, clipboard output or Excel.
                        </li>
                        <li>
                          No downloaded keys or browser private-key import.
                        </li>
                        <li>
                          No automatic account linking or domain-based
                          administration.
                        </li>
                        <li>One invitation, one permanent submission slot.</li>
                      </ul>
                    </section>
                    <section className="data-panel security-card">
                      <Icon name="lock" size={30} />
                      {context.liveSin ? <>
                        <h2>One-time retrieval</h2>
                        <p>Reveal &amp; Copy requires a recent Microsoft sign-in. Once requested, the portal removes the active encrypted payload before returning the value.</p>
                        <p>Backups may retain encrypted copies. Handle any clipboard copy according to your organization's practices.</p>
                      </> : <p>Live SIN collection and retrieval are closed.</p>}
                    </section>
                  </div>
                )}
                <footer className="workspace-footer">
                  <span>
                    <Icon name="shield" size={13} /> Protected by purpose,
                    permissions and careful handling.
                  </span>
                  <span>{context.workspace === 'staff' ? 'Morris Interactive · Staff workspace' : 'Morris Interactive · Synthetic test environment'}</span>
                </footer>
              </>
            )
          )}
        </main>
      </div>
      {drawer && (
        <div className="drawer-backdrop">
          <section
            ref={drawerRef}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-title"
          >
            <div className="drawer-heading">
              <span className="eyebrow">CONTRACTOR DETAILS</span>
              <Button
                icon="close"
                title="Close record details"
                onClick={() => setDrawer(null)}
              />
            </div>
            <h2 id="record-title">{drawer.name?.trim() || emailLocalPart(drawer.email)}</h2>
            <p className="muted">{drawer.email}</p>
            <Badge value={context.liveSin && drawer.retrievalStatus === 'retrieved' ? 'Retrieved / Removed' : drawer.submissionStatus} />
            <dl className="record-fields">
              {[
                ['name', 'Name'],
                ['email', 'Email'],
                ['invitationId', 'Invitation ID'],
                ['reference', 'Submission reference'],
              ].map(([field, label]) => (
                <div key={field}>
                  <dt>{label}</dt>
                  <dd>
                    <span>
                      {String((drawer as any)[field] || 'Not recorded')}
                    </span>
                    {copyButton(drawer, field)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="drawer-statuses">
              {[
                ['Retrieval', drawer.retrievalStatus],
                ['Transfer', drawer.transferStatus],
                ['Disposal', drawer.disposalStatus],
              ].filter(([label]) => !context.liveSin || label === 'Retrieval').map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <Badge value={value} />
                </div>
              ))}
            </div>
            <div className="drawer-actions">
              {context.liveSin ? <Button
                icon="lock"
                disabled={authorizationPending || busy || !drawer.submittedAt || drawer.retrievalStatus !== 'not_started'}
                onClick={() => {
                  setRevealError('');
                  setRevealed('');
                  setDialog({ kind: 'reveal-once', row: drawer });
                }}
              >Reveal &amp; Copy</Button> : <>
              <Button
                icon="lock"
                title="Review retrieval prerequisites; no sensitive data will be revealed"
                disabled={
                  !permissions.workflowManagement || !drawer.submittedAt
                }
                onClick={() => {
                  setConfirmed(false);
                  setDialog({ kind: 'retrieval', row: drawer });
                }}
              >
                Retrieval
              </Button>
              <Button
                icon="arrow"
                title="Review transfer requirements; confirmation stays gated"
                disabled={
                  !permissions.workflowManagement || !drawer.submittedAt
                }
                onClick={() => setDialog({ kind: 'transfer', row: drawer })}
              >
                Transfer
              </Button>
              <Button
                icon="burn"
                kind="danger-ghost"
                title="Burn removes a portal payload only under an approved disposal policy. Currently gated."
                disabled={
                  !permissions.workflowManagement || !drawer.submittedAt
                }
                onClick={() => setDialog({ kind: 'burn', row: drawer })}
              >
                Burn
              </Button>
              <Button
                title="Request controlled correction without reopening the consumed slot"
                disabled={
                  !permissions.correctionManagement ||
                  drawer.submissionStatus !== 'submitted'
                }
                onClick={() => {
                  setConfirmed(false);
                  setDialog({ kind: 'correction', row: drawer });
                }}
              >
                Request correction
              </Button></>}
              {context.workspace === 'staff' && <Button
                disabled={!permissions.invitationManagement || busy}
                onClick={() => {
                  setAddName(drawer.name);
                  setAddEmail(drawer.email);
                  setDialog({ kind: 'add', row: drawer });
                }}
              >
                Edit contractor name
              </Button>}
              <Button
                title="Revoke this invitation; preserve the existing record"
                disabled={
                  !permissions.invitationManagement ||
                  drawer.invitationStatus !== 'active'
                }
                onClick={() => {
                  setConfirmed(false);
                  setDialog({ kind: 'revoke', ids: [drawer.invitationId] });
                }}
              >
                Revoke invitation
              </Button>
            </div>
            {context.requestsV2 && <p>Manage this contractor’s assigned information and access in Contractors &amp; requests.</p>}
            <h3>Record activity</h3>
            {permissions.auditViewing ? (
              <>
                <>
                  {auditLoading && !events.length ? (
                    <p role="status" className="activity-loading">
                      <span className="spinner" /> Loading record activity…
                    </p>
                  ) : (
                    <Timeline
                      events={events}
                      directory={data?.adminDirectory || []}
                    />
                  )}
                </>
                {cursor && (
                  <Button
                    busy={auditLoading}
                    onClick={() => void audit(drawer, true)}
                  >
                    Load earlier
                  </Button>
                )}
              </>
            ) : (
              <p className="muted">Audit viewing permission is required.</p>
            )}
            <p className="fine-print">
              No sensitive value is available in this drawer.
            </p>
          </section>
          <button
            className="drawer-shade"
            aria-label="Close record drawer"
            onClick={() => setDrawer(null)}
          />
        </div>
      )}
      {columnModal && (
        <Modal
          title="Choose visible metadata"
          onClose={() => setColumnModal(false)}
        >
          <p>
            These columns also define the default fields for bulk copy and Excel
            export.
          </p>
          <div className="checkbox-grid">
            {META_COLUMNS.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={columns.includes(key)}
                  onChange={(e) => {
                    if (!e.target.checked && columns.length === 1) return;
                    setColumns(
                      e.target.checked
                        ? [...columns, key]
                        : columns.filter((c) => c !== key),
                    );
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <Button kind="primary" onClick={() => setColumnModal(false)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
      {dialog && (
        <Modal
          title={
            dialog.kind === 'export'
              ? 'Export authorized metadata'
              : dialog.kind === 'add'
                ? context.workspace === 'staff' ? 'Manage approved contractor access' : 'Add approved test identities'
                : dialog.kind === 'import'
                  ? 'Review CSV import'
                  : dialog.kind === 'reveal-once'
                    ? 'Reveal & Copy'
                    : dialog.kind === 'burn'
                    ? 'Burn · secure disposal'
                    : dialog.kind === 'retrieval'
                      ? 'Controlled retrieval'
                      : dialog.kind === 'transfer'
                        ? 'Confirm secure transfer'
                        : dialog.kind === 'correction'
                          ? 'Request a correction'
                          : dialog.kind === 'assign_self'
                            ? 'Assign selected records'
                            : 'Revoke invitations'
          }
          onClose={() => {
            if (!busy) {
              setRevealed('');
              setDialog(null);
              setConfirmed(false);
            }
          }}
          wide={dialog.kind === 'export' || dialog.kind === 'import'}
        >
          {dialog.kind === 'export' ? (
            <>
              <p>
                Only the selected administrative fields will be included. SINs,
                keys, ciphertext and tokens are never available for export.
              </p>
              <label className="field-label">
                Export scope
                <select
                  value={outputScope}
                  onChange={(e) => setOutputScope(e.target.value)}
                >
                  <option value="filtered">
                    Current filtered results ({filtered.length})
                  </option>
                  <option value="selected" disabled={!selected.length}>
                    Selected rows ({selected.length})
                  </option>
                  <option value="all">
                    All authorized metadata ({data?.rows.length || 0})
                  </option>
                </select>
              </label>
              <div className="checkbox-grid">
                {META_COLUMNS.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={exportFields.includes(key)}
                      onChange={(e) =>
                        setExportFields(
                          e.target.checked
                            ? [...exportFields, key]
                            : exportFields.filter((f) => f !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="callout">
                {countForExport} records · {exportFields.length} explicit fields
                · formatted .xlsx · backend permission check and audit required
              </div>
              <div className="modal-actions">
                <Button disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  icon="download"
                  busy={busy}
                  disabled={!countForExport || !exportFields.length}
                  onClick={() => void exportFile()}
                >
                  Export {countForExport} records
                </Button>
              </div>
            </>
          ) : dialog.kind === 'add' ? (
            <>
              <p>
                {context.workspace === 'staff'
                  ? 'Manage approved contractor metadata. SIN collection remains closed.'
                  : 'Cloud testing accepts only independently verified dedicated test accounts.'}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
                    await importList(
                      `name,email,status\n${quote(addName)},${quote(addEmail)},active`,
                      dialog.row ? 'rename' : 'create',
                    );
                    setAddEmail('');
                  });
                }}
              >
                {context.workspace === 'staff' ? (
                  <label className="field-label">
                    Contractor name (optional)
                    <input maxLength={100} value={addName}
                      onChange={(event) => setAddName(event.target.value)} />
                  </label>
                ) : <label className="field-label">
                  Test label
                  <select
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                  >
                    <option value="">Use email name</option>
                    {['Test account', 'Test Microsoft', 'Test Google'].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </label>}
                <label className="field-label">
                  Approved email
                  <input
                    required
                    type="email"
                    maxLength={254}
                    value={addEmail}
                    readOnly={Boolean(dialog.row)}
                    onChange={(e) => setAddEmail(e.target.value)}
                  />
                </label>
                {context.workspace !== 'staff' && permissions.administratorManagement && <label className="callout">
                <input type="checkbox" checked={dedicatedTesters}
                  onChange={(event) => setDedicatedTesters(event.target.checked)} />
                I independently confirmed that these are dedicated Gmail test accounts.
              </label>}
                <Button type="submit" kind="primary" busy={busy}>
                  {dialog.row ? 'Save contractor name' : 'Add approved identity'}
                </Button>
              </form>
              {!dialog.row && <><div className="divider-label">or import a CSV</div>
              <label className="upload-zone">
                <Icon name="upload" />
                <strong>Choose approved email CSV</strong>
                <small>name,email,status · up to 100 rows · 64 KiB</small>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Import approved email CSV"
                  onChange={(e) => void readCsv(e.target.files?.[0])}
                />
              </label></>}
            </>
          ) : dialog.kind === 'import' ? (
            <>
              <p>
                {csvPreview.length} rows parsed. Review every entry before the
                backend validates the import.
              </p>
              {context.workspace !== 'staff' && permissions.administratorManagement && <label className="callout">
                <input type="checkbox" checked={dedicatedTesters}
                  onChange={(event) => setDedicatedTesters(event.target.checked)} />
                I independently confirmed that these are dedicated Gmail test accounts.
              </label>}
              <div className="table-scroll import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((r) => (
                      <tr key={r.email}>
                        <td>{r.name || '—'}</td>
                        <td>{r.email}</td>
                        <td>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <Button disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  busy={busy}
                  onClick={() => void action(() => importList(csv))}
                >
                  Confirm {csvPreview.length} approved rows
                </Button>
              </div>
            </>
          ) : dialog.kind === 'reveal-once' ? (
            <div>
              <p>The portal removes this value before releasing it. If delivery fails, it cannot be revealed again.</p>
              {revealed && <label className="field-label">Clipboard blocked. Copy this value manually within 30 seconds.
                <textarea readOnly value={revealed} autoComplete="off" onFocus={(event) => event.target.select()} />
              </label>}
              {revealError && <p role="alert">{revealError}</p>}
              <div className="modal-actions">
                <Button disabled={busy} onClick={() => { setRevealed(''); setDialog(null); }}>Close</Button>
                <Button kind="primary" disabled={authorizationPending || busy || Boolean(revealed || revealError)}
                  onClick={() => void revealOnce(dialog.row!.invitationId)}>Reveal &amp; Copy once</Button>
              </div>
            </div>
          ) : ['burn', 'retrieval', 'transfer'].includes(dialog.kind) ? (
            <>
              <div className="gate-symbol">
                <Icon
                  name={dialog.kind === 'burn' ? 'burn' : 'lock'}
                  size={30}
                />
              </div>
              <p className="record-reference">Record {dialog.row?.reference}</p>
              <h3>
                {dialog.kind === 'burn'
                  ? 'Remove this record from the portal under the approved disposal policy.'
                  : 'This step requires additional verified controls.'}
              </h3>
              <ul className="prerequisites">
                <li>
                  <Icon name="lock" size={16} />
                  Authorized sensitive workflow role and fresh MFA
                </li>
                <li>
                  <Icon name="lock" size={16} />
                  Approved retrieval and official transfer destination
                </li>
                <li>
                  <Icon name="lock" size={16} />
                  Confirmed transfer:{' '}
                  {human(dialog.row?.transferStatus || 'not_started')}
                </li>
                <li>
                  <Icon name="lock" size={16} />
                  Independent security/privacy and retention approval
                </li>
              </ul>
              <div className="callout warning">
                This release cannot reveal or dispose of a payload. Backups and
                legal record-retention obligations may remain. No cryptographic
                destruction is claimed.
              </div>
              <div className="modal-actions">
                <Button onClick={() => setDialog(null)}>Close</Button>
                <Button
                  title="Required production security/privacy controls are not approved"
                  disabled
                  kind="danger"
                >
                  {dialog.kind === 'burn'
                    ? 'Burn unavailable'
                    : 'Confirmation unavailable'}
                </Button>
                <Button
                  busy={busy}
                  title="Record a backend-audited blocked request without revealing, transferring or deleting anything"
                  onClick={() => void executeDialog()}
                >
                  Record review request
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                {dialog.kind === 'correction'
                  ? 'Revoke access and flag this submission for a controlled correction. The permanent submission slot will remain consumed.'
                  : dialog.kind === 'assign_self'
                    ? `Assign ${dialog.ids?.length} records to your administrator identity.`
                    : `Revoke ${dialog.ids?.length} invitations. Existing submissions and permanent slots will be preserved.`}
              </p>
              {dialog.row && (
                <p className="record-reference">{dialog.row.reference}</p>
              )}
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed the selected records and understand this change.
              </label>
              <div className="modal-actions">
                <Button disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  kind={dialog.kind === 'revoke' ? 'danger' : 'primary'}
                  busy={busy}
                  disabled={!confirmed}
                  onClick={() => void executeDialog()}
                >
                  Confirm{' '}
                  {dialog.kind === 'assign_self'
                    ? 'assignment'
                    : dialog.kind === 'correction'
                      ? 'correction request'
                      : 'revocation'}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
export function Timeline({
  events,
  directory,
}: {
  events: Event[];
  directory: { uid: string; label: string }[];
}) {
  return events.length ? (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id}>
          <span className="timeline-dot">
            <Icon
              name={
                event.event.includes('blocked')
                  ? 'lock'
                  : event.event.includes('export')
                    ? 'download'
                    : event.event.includes('copy')
                      ? 'copy'
                      : 'check'
              }
              size={13}
            />
          </span>
          <div>
            <strong>{human(event.event)}</strong>
            <p>
              {directory.find((a) => a.uid === event.actorUid)?.label ||
                'Authorized portal identity'}{' '}
              <span>· {time(event.at)}</span>
            </p>
            <small className="audit-ref">
              Audit {event.id.slice(0, 12)}
              {event.count !== null && event.count !== undefined
                ? ` · ${event.count} records`
                : ''}
            </small>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <Empty title="No events in this activity page">
      No matching server-generated events were returned. Broaden the filters or
      load an earlier page.
    </Empty>
  );
}
