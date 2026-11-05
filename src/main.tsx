import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  auth,
  db,
  signIn,
  logout,
  api,
  isLocal,
  safeError,
} from './app/firebase';
import {
  encryptSin,
  normalizeAndValidate,
  syntheticValues,
} from './app/encryption';
import { parseAllowlistCsv } from '../functions/lib/csv.mjs';
import './styles.css';
type Contractor = {
  name: string;
  email: string;
  status: string;
  invitationId: string;
  reference: string;
  revision: number;
  submissionStatus: string;
};
type Context = {
  kind: 'admin' | 'contractor';
  email?: string;
  needsVerification?: boolean;
  submitted?: boolean;
  invitationId: string;
  reference: string;
  revision: number;
  keyId: string;
  publicKey: JsonWebKey;
  permissions?: Record<string, boolean>;
};
function App() {
  const [portal, setPortal] = useState<Context | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [staff, setStaff] = useState(false);
  const [code, setCode] = useState(''),
    [verificationSent, setVerificationSent] = useState(false),
    [testCode, setTestCode] = useState('');
  const [sin, setSin] = useState(''),
    [show, setShow] = useState(false),
    [review, setReview] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [success, setSuccess] = useState(false);
  const [rows, setRows] = useState<Contractor[]>([]),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<
      Array<{ name: string; email: string; status: string }>
    >([]),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [tab, setTab] = useState('overview');
  const errorRef = useRef<HTMLDivElement>(null);
  const reset = () => {
    setPortal(null);
    setSin('');
    setCode('');
    setTestCode('');
    setReview(false);
    setConfirmed(false);
    setRows([]);
    setCsv('');
    setPreview([]);
    setVerificationSent(false);
    setSuccess(false);
  };
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (!u) reset();
      }),
    [],
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (
      !isLocal ||
      !portal ||
      portal.kind !== 'contractor' ||
      portal.needsVerification ||
      !auth.currentUser
    )
      return;
    return onSnapshot(
      doc(db, 'portalSessions', auth.currentUser.uid),
      () => {},
      () => {
        reset();
        setError(
          'Your portal authorization changed or expired. Sign in again to check access.',
        );
        void logout();
      },
    );
  }, [portal?.kind, portal?.needsVerification, portal?.revision]);
  useEffect(() => {
    if (!isLocal || portal?.kind !== 'admin' || !auth.currentUser) return;
    return onSnapshot(
      doc(db, 'roles', auth.currentUser.uid),
      (snapshot) => {
        if (!snapshot.data()?.active) {
          reset();
          void logout();
        }
      },
      () => {
        reset();
        void logout();
      },
    );
  }, [portal?.kind]);
  useEffect(() => {
    const clear = () => {
      setSin('');
      setShow(false);
      setReview(false);
      setConfirmed(false);
    };
    const hidden = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', clear);
    let timer: ReturnType<typeof setTimeout>;
    const activity = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        clear();
        void logout();
        setError('Your session expired. Please sign in again.');
      }, 10 * 60000);
    };
    for (const event of ['pointerdown', 'keydown'])
      window.addEventListener(event, activity);
    activity();
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', clear);
      for (const event of ['pointerdown', 'keydown'])
        window.removeEventListener(event, activity);
    };
  }, []);
  useEffect(() => {
    if (isLocal || !portal) return;
    const timer = setInterval(() => {
      void api<Context>('portalContext')
        .then((c) => setPortal(c))
        .catch(() => {
          reset();
          void logout();
          setError('Your cloud-test access changed or expired.');
        });
    }, 60000);
    return () => clearInterval(timer);
  }, [portal?.kind]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const c = await api<Context>('portalContext');
    setPortal(c);
    if (c.kind === 'admin' && c.permissions?.statusViewing) await loadRows();
  }
  async function loadRows() {
    setRows(
      (await api<{ contractors: Contractor[] }>('portalListContractors'))
        .contractors,
    );
  }
  async function login(provider: 'microsoft.com' | 'google.com') {
    await run(async () => {
      reset();
      await signIn(provider, staff);
      await refresh();
    });
  }
  async function sendVerification() {
    await run(async () => {
      await api('portalSendVerification');
      setVerificationSent(true);
      setTestCode('');
      setNotice('A single-use code has been sent to your approved email.');
    });
  }
  async function verify() {
    await run(async () => {
      await api('portalVerifyEmail', { code });
      setCode('');
      setTestCode('');
      await refresh();
    });
  }
  async function commitCsv(text: string) {
    await api('portalImportAllowlist', { csv: text });
    setCsv('');
    setPreview([]);
    setNotice(
      'Approved list updated. Existing submission slots were preserved.',
    );
    if (portal?.permissions?.statusViewing) await loadRows();
  }
  async function changeStatus(r: Contractor, status: string) {
    await run(() =>
      commitCsv(
        `name,email,status\n${quote(r.name)},${quote(r.email)},${status}`,
      ),
    );
  }
  async function submit() {
    await run(async () => {
      if (!portal || !confirmed) return;
      const syntheticValue = normalizeAndValidate(sin);
      const ciphertext = isLocal
        ? await encryptSin(syntheticValue, portal)
        : undefined;
      await api(
        'portalSubmit',
        isLocal
          ? {
              invitationId: portal.invitationId,
              revision: portal.revision,
              keyId: portal.keyId,
              ciphertext,
              syntheticValue,
            }
          : {
              invitationId: portal.invitationId,
              revision: portal.revision,
              fixtureId:
                syntheticValue === syntheticValues[0]
                  ? 'fixture-a'
                  : 'fixture-b',
            },
      );
      setSin('');
      setReview(false);
      setConfirmed(false);
      setSuccess(true);
      await refresh();
    });
  }
  function readFile(file?: File) {
    if (!file) return;
    if (file.size > 65536) {
      setError('The CSV exceeds 64 KiB.');
      return;
    }
    void file.text().then((text) => {
      try {
        const parsed = parseAllowlistCsv(text);
        setCsv(text);
        setPreview(parsed);
        setError('');
      } catch {
        setError(
          'Check CSV columns name,email,status, duplicate emails and the 100-row limit.',
        );
      }
    });
  }
  const metric = (label: string, value: number) => (
    <div className="metric" key={label}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="review">
        <strong>
          {isLocal ? 'Local Phase 2 MVP.' : 'Synthetic cloud test only.'}
        </strong>{' '}
        Synthetic identities and fixtures only. Real collection, sensitive
        retrieval and disposal are disabled.
      </div>
      <header className="header">
        <div>
          <div className="brand">Morris Interactive</div>
          <div className="asset">
            Approved logo asset pending · organization label
          </div>
        </div>
        <div className="portal">Secure SIN Collection Portal</div>
      </header>
      <main id="main">
        <div aria-live="polite">
          {notice && <div className="notice">{notice}</div>}
        </div>
        {error && (
          <div className="error" role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </div>
        )}
        {!portal ? (
          <section className="layout card">
            <div className="eyebrow">
              {staff ? 'MI administrator access' : 'Contractor access'}
            </div>
            <h1>A secure way to share your information.</h1>
            <p>
              Sign in using the exact email address approved by Morris
              Interactive.
            </p>
            <div className="buttonstack">
              <button disabled={busy} onClick={() => login('microsoft.com')}>
                <MicrosoftIcon />
                Continue with Microsoft
              </button>
              {!staff && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => login('google.com')}
                >
                  <span aria-hidden="true" className="gmark">
                    G
                  </span>
                  Continue with Google
                </button>
              )}
            </div>
            <div className="notice">
              <strong>An invitation is required.</strong>
              <p>
                Signing in alone does not grant portal access. Your approved
                email and invitation status are checked by the backend.
              </p>
            </div>
            <button
              className="textbutton"
              disabled={busy}
              onClick={() => {
                setStaff(!staff);
                setError('');
              }}
            >
              {staff ? 'Back to contractor sign-in' : 'MI staff sign-in'}
            </button>
            {isLocal && (
              <p className="hint">
                Start the local emulators and seed the test accounts. No
                Microsoft or Google password is entered into this portal.
              </p>
            )}
          </section>
        ) : portal.kind === 'admin' ? (
          <>
            <div className="pagehead">
              <div>
                <div className="eyebrow">
                  Administration · synthetic testing
                </div>
                <h1>Collection overview</h1>
                <p>
                  Manage approved invitations and follow submission statuses.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => void logout()}
                disabled={busy}
              >
                Sign out
              </button>
            </div>
            <nav className="nav" aria-label="Administrator sections">
              {['overview', 'invitations', 'activity'].map((t) => (
                <button
                  key={t}
                  className={tab === t ? 'selected' : 'secondary'}
                  onClick={() => setTab(t)}
                >
                  {t === 'overview'
                    ? 'Overview'
                    : t === 'invitations'
                      ? 'Approved invitations'
                      : 'Activity & handling'}
                </button>
              ))}
            </nav>
            {tab === 'overview' && (
              <>
                <div className="metrics">
                  {metric(
                    'Approved records',
                    rows.filter((r) => r.status === 'active').length,
                  )}
                  {metric(
                    'Pending invitations',
                    rows.filter(
                      (r) =>
                        r.submissionStatus === 'pending' &&
                        r.status === 'active',
                    ).length,
                  )}
                  {metric(
                    'Submitted',
                    rows.filter((r) => r.submissionStatus === 'submitted')
                      .length,
                  )}
                  {metric(
                    'Revoked or removed',
                    rows.filter((r) => r.status !== 'active').length,
                  )}
                </div>
                <div className="panel">
                  <h2>Contractor status</h2>
                  {portal.permissions?.statusViewing ? (
                    <ContractorTable
                      rows={rows}
                      busy={busy}
                      canManage={!!portal.permissions.invitationManagement}
                      canCorrect={!!portal.permissions.correctionManagement}
                      changeStatus={changeStatus}
                      correction={(r) =>
                        run(async () => {
                          await api('portalRequestCorrection', {
                            invitationId: r.invitationId,
                          });
                          setNotice(
                            'Correction requested. Access revoked; the original slot stays consumed. Follow the reviewed disposal and reissue process.',
                          );
                          await loadRows();
                        })
                      }
                    />
                  ) : (
                    <p>
                      Your assigned role does not include submission status
                      viewing.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === 'invitations' && (
              <>
                {portal.permissions?.invitationManagement ? (
                  <>
                    <section className="panel">
                      <h2>Import approved email addresses</h2>
                      <p>
                        CSV columns: <code>name,email,status</code>. Up to 100
                        rows; 30 contractors expected. Status: active, revoked
                        or removed.
                      </p>
                      <label className="field" htmlFor="csv">
                        Choose a CSV
                      </label>
                      <input
                        id="csv"
                        type="file"
                        accept=".csv,text/csv"
                        disabled={busy}
                        onChange={(e) => readFile(e.target.files?.[0])}
                      />
                      {preview.length > 0 && (
                        <>
                          <div className="notice">
                            {preview.length} valid rows ready for review.
                            Reimporting never resets an existing submission.
                          </div>
                          <div className="tablewrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {preview.map((r) => (
                                  <tr key={r.email}>
                                    <td>{r.name}</td>
                                    <td>{r.email}</td>
                                    <td>{r.status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            disabled={busy}
                            onClick={() => run(() => commitCsv(csv))}
                          >
                            Confirm import
                          </button>
                        </>
                      )}
                    </section>
                    <section className="panel">
                      <h2>Add an approved contractor</h2>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await commitCsv(
                              `name,email,status\n${quote(name)},${quote(email)},active`,
                            );
                            setName('');
                            setEmail('');
                          });
                        }}
                      >
                        <div className="twocol">
                          <div>
                            <label className="field" htmlFor="name">
                              Name (optional)
                            </label>
                            {!isLocal ? (
                              <select
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                              >
                                <option value="">No name</option>
                                {[
                                  'Test account',
                                  'Test Microsoft',
                                  'Test Google',
                                ].map((label) => (
                                  <option key={label}>{label}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id="name"
                                maxLength={100}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                              />
                            )}
                          </div>
                          <div>
                            <label className="field" htmlFor="email">
                              Approved email
                            </label>
                            <input
                              id="email"
                              required
                              type="email"
                              maxLength={254}
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            />
                          </div>
                        </div>
                        <button disabled={busy}>Add to approved list</button>
                      </form>
                    </section>
                  </>
                ) : (
                  <div className="panel">
                    Invitation management is not assigned to this account.
                  </div>
                )}
              </>
            )}
            {tab === 'activity' && (
              <section className="panel">
                <h2>Restricted handling</h2>
                <p>
                  The contractor list never contains SIN values or last-four
                  digits.
                </p>
                <div className="notice">
                  Sensitive retrieval is disabled pending verified fresh
                  step-up, approved offline key handling and independent
                  security review. No private-key import, export or reveal is
                  provided here.
                </div>
                <button disabled>Request sensitive retrieval</button>
                <h2 className="spaceabove">Corrections and disposal</h2>
                <p>
                  Authorized correction requests revoke access and preserve the
                  consumed submission slot. They do not reopen submissions,
                  delete official records or certify disposal. Follow the
                  controlled review process.
                </p>
                <p className="hint">
                  Backend state-change audit events are restricted. This MVP
                  does not claim complete offline-decryption auditing or
                  automatic deadline disposal.
                </p>
              </section>
            )}
          </>
        ) : (
          <div className="layout">
            <div className="topline">
              Private information · approved invitation
            </div>
            <ol className="steps">
              <li className={!success && !portal.submitted ? 'active' : ''}>
                1. Verify access
              </li>
              <li className={review ? 'active' : ''}>2. Review and submit</li>
              <li className={success || portal.submitted ? 'active' : ''}>
                3. Complete
              </li>
            </ol>
            <section className="card">
              <div className="identity">
                <span className="caption">Approved email</span>
                <strong>{portal.email}</strong>
              </div>
              {success || portal.submitted ? (
                <>
                  <div className="symbol">✓</div>
                  <h1>
                    {success
                      ? 'Thank you. Your information has been submitted securely.'
                      : 'This invitation has already been submitted.'}
                  </h1>
                  <p>
                    No further action is required unless Morris Interactive
                    contacts you. Your SIN cannot be retrieved or changed here.
                  </p>
                </>
              ) : portal.needsVerification ? (
                <>
                  <h1>Verify your approved email.</h1>
                  <p>
                    This sign-in does not establish the email ownership needed
                    by the portal. We'll send a separate single-use code to your
                    approved address.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void sendVerification()}
                  >
                    {verificationSent
                      ? 'Resend verification code'
                      : 'Send verification code'}
                  </button>
                  {verificationSent && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void verify();
                      }}
                    >
                      <label className="field" htmlFor="otp">
                        Eight-digit code
                      </label>
                      <input
                        id="otp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={8}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                      />
                      <p className="hint">
                        Expires in ten minutes. Five attempts. Resends
                        invalidate earlier codes.
                      </p>
                      <button disabled={busy}>Verify and continue</button>
                      {isLocal && (
                        <div className="notice">
                          <button
                            type="button"
                            className="textbutton"
                            onClick={() =>
                              run(async () =>
                                setTestCode(
                                  (
                                    await api<{ code: string }>(
                                      'portalTestMailbox',
                                    )
                                  ).code,
                                ),
                              )
                            }
                          >
                            Open synthetic test mailbox
                          </button>
                          {testCode && <p>Local fixture code: {testCode}</p>}
                        </div>
                      )}
                    </form>
                  )}
                </>
              ) : (
                <>
                  <h1>
                    {review ? 'Review before submitting.' : 'Enter your SIN.'}
                  </h1>
                  <p>
                    {review
                      ? 'Check the synthetic fixture carefully. This invitation permits one successful submission.'
                      : "You'll review the number before the final submission."}
                  </p>
                  <div className="notice">
                    <strong>Synthetic fixtures only</strong>
                    <p>
                      Use <code>{syntheticValues[0]}</code> or{' '}
                      <code>{syntheticValues[1]}</code>. These test-only values
                      are intentionally not issued SINs. Real collection is
                      disabled.
                    </p>
                  </div>
                  <label className="field" htmlFor="sin">
                    Social Insurance Number · synthetic fixture
                  </label>
                  <div className="inputrow">
                    {!isLocal ? (
                      <select
                        id="sin"
                        aria-describedby="sinhelp"
                        value={sin}
                        disabled={review}
                        onChange={(e) => setSin(e.target.value)}
                      >
                        <option value="">Choose a synthetic fixture</option>
                        {syntheticValues.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="sin"
                        type={show ? 'text' : 'password'}
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={24}
                        value={sin}
                        readOnly={review}
                        onChange={(e) => setSin(e.target.value)}
                        aria-describedby="sinhelp"
                      />
                    )}

                    {isLocal && (
                      <button
                        className="secondary"
                        type="button"
                        aria-pressed={show}
                        onClick={() => setShow(!show)}
                      >
                        {show ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                  <p id="sinhelp" className="hint">
                    Nine digits. Spaces and hyphens accepted. No value is saved
                    in browser storage. Cloud testing accepts fixture choices
                    only.
                  </p>
                  <div className="notice">
                    <strong>Privacy and purpose</strong>
                    <p>
                      Real collection requires an approved tax-reporting
                      purpose, privacy contact, retention policy and secure
                      official destination. Only the documented synthetic
                      fixtures may be stored during this test.
                    </p>
                  </div>
                  {review ? (
                    <>
                      <label className="checkrow">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        I checked the synthetic fixture and understand that this
                        submission cannot be changed here.
                      </label>
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            setReview(false);
                            setConfirmed(false);
                          }}
                        >
                          Correct number
                        </button>
                        <button
                          disabled={busy || !confirmed}
                          onClick={() => void submit()}
                        >
                          Submit securely
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => {
                        try {
                          const value = normalizeAndValidate(sin);
                          if (!syntheticValues.includes(value))
                            throw new Error();
                          setReview(true);
                          setShow(false);
                          setError('');
                        } catch {
                          setError(
                            'Use one of the documented synthetic fixture values.',
                          );
                        }
                      }}
                    >
                      Review information
                    </button>
                  )}
                </>
              )}
              <button
                className="textbutton"
                disabled={busy}
                onClick={() => void logout()}
              >
                Sign out
              </button>
            </section>
          </div>
        )}
        <footer>
          Morris Interactive · Synthetic testing only · Real collection not
          approved
        </footer>
      </main>
    </>
  );
}
function quote(s: string) {
  return '"' + s.replaceAll('"', '""') + '"';
}
function MicrosoftIcon() {
  return (
    <span className="msmark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function ContractorTable({
  rows,
  busy,
  canManage,
  canCorrect,
  changeStatus,
  correction,
}: {
  rows: Contractor[];
  busy: boolean;
  canManage: boolean;
  canCorrect: boolean;
  changeStatus: (r: Contractor, s: string) => unknown;
  correction: (r: Contractor) => unknown;
}) {
  return (
    <div
      className="tablewrap"
      role="region"
      aria-label="Approved contractor status"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Approved email</th>
            <th>Invitation</th>
            <th>Submission</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.invitationId}>
              <td>{r.name || '—'}</td>
              <td>{r.email}</td>
              <td>
                <span className="pill">{r.status}</span>
              </td>
              <td>{r.submissionStatus}</td>
              <td>
                <div className="tableactions">
                  {canManage && r.status === 'active' && (
                    <button
                      className="textbutton"
                      disabled={busy}
                      onClick={() => changeStatus(r, 'revoked')}
                    >
                      Revoke
                    </button>
                  )}
                  {canManage && r.status !== 'removed' && (
                    <button
                      className="textbutton"
                      disabled={busy}
                      onClick={() => changeStatus(r, 'removed')}
                    >
                      Remove
                    </button>
                  )}
                  {canCorrect && r.submissionStatus === 'submitted' && (
                    <button
                      className="textbutton"
                      disabled={busy}
                      onClick={() => correction(r)}
                    >
                      Request correction
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5}>No records to display.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
