import React, { useEffect, useState } from 'react';
import type { Api, Context } from './types';
import { Button, Icon, Help } from './components';
import {
  syntheticValues,
  normalizeAndValidate,
  encryptSin,
} from '../app/encryption';
export default function Contractor(props: Parameters<typeof FixtureContractor>[0]) {
  return props.context.liveSin ? <LiveContractor {...props} /> : <FixtureContractor {...props} />;
}

function LiveContractor({ context, api, signOut }: Parameters<typeof FixtureContractor>[0]) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const clear = () => { if (document.hidden) setValue(''); };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    let sin: string;
    try {
      sin = normalizeAndValidate(value);
    } catch {
      setError('Enter a valid nine-digit Canadian SIN.');
      return;
    }
    setBusy(true);
    setValue('');
    try {
      await api('portalSubmitSin', { sin });
      setComplete(true);
    } catch (cause) {
      if ((cause as { code?: string }).code === 'functions/already-exists') setComplete(true);
      else setError('Submission could not be confirmed. Check your connection or sign in again to check the status.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="contractor-shell">
    <header className="public-header">
      <img src="/brand/mi-logo-white.png" alt="Morris Interactive" />
      <Button icon="logout" onClick={signOut}>Sign out</Button>
    </header>
    <main className="contractor-main">
      <h1>Secure SIN submission</h1>
      {context.submitted || complete ? <p role="status">Your SIN has been submitted securely.</p> :
        <form onSubmit={(event) => void submit(event)}>
          <p>Morris Interactive will receive your SIN. An authorized administrator can retrieve it once.</p>
          <label className="field-label">Social Insurance Number
            <input type="password" inputMode="numeric" autoComplete="off" required maxLength={24}
              value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" kind="primary" busy={busy} disabled={busy}>Submit SIN</Button>
        </form>}
    </main>
  </div>;
}

function FixtureContractor({
  context,
  api,
  local,
  onContext,
  notify,
  signOut,
}: {
  context: Context;
  api: Api;
  local: boolean;
  onContext: (c: Context) => void;
  notify: (s: string, error?: boolean) => void;
  signOut: () => void;
}) {
  const [stage, setStage] = useState(
      context.submitted
        ? 'complete'
        : context.needsVerification
          ? 'verify'
          : 'instructions',
    ),
    [value, setValue] = useState(''),
    [code, setCode] = useState(''),
    [sent, setSent] = useState(false),
    [testCode, setTestCode] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (context.submitted) {
      setValue('');
      setConfirmed(false);
      setStage('complete');
    }
  }, [context.submitted]);
  useEffect(() => {
    const clear = () => {
      if (document.hidden) {
        setValue('');
        setConfirmed(false);
        if (stage === 'review') setStage('entry');
      }
    };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, [stage]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError(
        'This step could not be completed. Check your authorization or connection and retry. No success has been assumed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    await perform(async () => {
      const syntheticValue = normalizeAndValidate(value);
      if (!syntheticValues.includes(syntheticValue) || !confirmed) return;
      await api(
        'portalSubmit',
        local
          ? {
              invitationId: context.invitationId,
              revision: context.revision,
              keyId: context.keyId,
              syntheticValue,
              ciphertext: await encryptSin(syntheticValue, context),
            }
          : {
              invitationId: context.invitationId,
              revision: context.revision,
              fixtureId:
                syntheticValue === syntheticValues[0]
                  ? 'fixture-a'
                  : 'fixture-b',
            },
      );
      setValue('');
      setConfirmed(false);
      setStage('complete');
      notify('The backend confirmed your synthetic submission.');
    });
  }
  const n =
    stage === 'verify'
      ? 1
      : stage === 'instructions'
        ? 2
        : stage === 'entry'
          ? 3
          : stage === 'review'
            ? 4
            : 5;
  return (
    <div className="contractor-shell">
      <header className="public-header">
        <img
          src="/brand/mi-logo-white.png"
          alt="Morris Interactive · it starts with people"
        />
        <span>
          <Icon name="lock" size={14} /> Secure collection portal
        </span>
        <Button
          icon="logout"
          title="Sign out and clear this session"
          onClick={signOut}
        >
          Sign out
        </Button>
      </header>
      <main className="contractor-main">
        <nav aria-label="Submission progress" className="submission-progress">
          {[
            'Access verified',
            'Instructions',
            'Synthetic fixture',
            'Review',
            'Complete',
          ].map((s, i) => (
            <span
              key={s}
              aria-current={n === i + 1 ? 'step' : undefined}
              className={n > i ? 'done' : ''}
            >
              <i>{n > i + 1 ? <Icon name="check" size={12} /> : i + 1}</i>
              <small>{s}</small>
            </span>
          ))}
        </nav>
        <div className="contractor-grid">
          <aside className="journey-aside">
            <span className="eyebrow">A CAREFUL COLLECTION JOURNEY</span>
            <h1>
              Your information.
              <br /> <em>Handled with care.</em>
            </h1>
            <p>
              A few clear steps, with privacy at the centre. This environment is
              for synthetic testing only.
            </p>
            <div className="privacy-promise">
              <Icon name="shield" size={24} />
              <div>
                <strong>One invitation. One submission.</strong>
                <p>
                  Only the approved identity can proceed. No sensitive digits
                  appear in administrator lists.
                </p>
              </div>
            </div>
            <div className="privacy-promise">
              <Icon name="lock" size={24} />
              <div>
                <strong>Real SIN entry is unavailable.</strong>
                <p>
                  This review accepts two predefined, unissued fixtures.
                  Sensitive retrieval and disposal remain restricted.
                </p>
              </div>
            </div>
          </aside>
          <section className="flow-card" aria-labelledby="flow-title">
            <div className="flow-card-top">
              <span className="test-label">SYNTHETIC TEST</span>
              <span className="muted">Step {n} of 5</span>
            </div>
            <div className="identity-chip">
              <span className="avatar">
                <Icon name="mail" />
              </span>
              <div>
                <small>Approved identity</small>
                <strong>{context.email}</strong>
              </div>
              <Icon name="shield" size={18} />
            </div>
            {error && (
              <div role="alert" className="inline-error">
                {error}
              </div>
            )}
            {stage === 'verify' ? (
              <>
                <h2 id="flow-title">Verify your approved email.</h2>
                <p>
                  This provider assertion does not establish the ownership
                  required for this invitation. Use a separate, single-use
                  verification code.
                </p>
                <Button
                  kind="primary"
                  busy={busy}
                  title="Send a short-lived code only to the approved email"
                  onClick={() =>
                    void perform(async () => {
                      await api('portalSendVerification');
                      setSent(true);
                      notify(
                        'Verification code sent. It expires in ten minutes.',
                      );
                    })
                  }
                >
                  {sent ? 'Resend code' : 'Send verification code'}
                </Button>
                {sent && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void perform(async () => {
                        await api('portalVerifyEmail', { code });
                        setCode('');
                        setTestCode('');
                        const c = await api<Context>('portalContext');
                        onContext(c);
                        setStage(c.submitted ? 'complete' : 'instructions');
                      });
                    }}
                  >
                    <label className="field-label">
                      Eight-digit code
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={8}
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </label>
                    <p className="fine-print">
                      Five attempts. Resending invalidates the previous code.
                    </p>
                    <Button type="submit" kind="primary" busy={busy}>
                      Verify and continue
                    </Button>
                    {local && (
                      <div className="callout">
                        <Button
                          onClick={() =>
                            void perform(async () =>
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
                          Open synthetic mailbox
                        </Button>
                        {testCode && <p>Fixture code: {testCode}</p>}
                      </div>
                    )}
                  </form>
                )}
              </>
            ) : stage === 'instructions' ? (
              <>
                <span className="flow-icon">
                  <Icon name="file" size={25} />
                </span>
                <h2 id="flow-title">A quick overview before you begin.</h2>
                <p>
                  Choose a synthetic fixture, review it, then confirm. The
                  portal will accept one submission for this invitation.
                </p>
                <ol className="instruction-list">
                  <li>
                    <b>01</b>
                    <div>
                      <strong>Use a test fixture only.</strong>
                      <p>A real SIN is never needed in this review.</p>
                    </div>
                  </li>
                  <li>
                    <b>02</b>
                    <div>
                      <strong>Check before confirming.</strong>
                      <p>
                        You can return and change the fixture before submission.
                      </p>
                    </div>
                  </li>
                  <li>
                    <b>03</b>
                    <div>
                      <strong>Wait for confirmation.</strong>
                      <p>Success appears only after backend acknowledgment.</p>
                    </div>
                  </li>
                </ol>
                <Button
                  kind="primary"
                  icon="arrow"
                  onClick={() => setStage('entry')}
                >
                  Continue to synthetic submission
                </Button>
                <div className="fine-print">
                  A production privacy notice, approved purpose, retention
                  period and privacy contact are required before real
                  collection.
                </div>
              </>
            ) : stage === 'entry' ? (
              <>
                <span className="flow-icon">
                  <Icon name="lock" size={25} />
                </span>
                <h2 id="flow-title">Choose a synthetic fixture.</h2>
                <p>
                  Real SIN entry is disabled. These unissued test values
                  exercise the secure workflow without collecting a government
                  identifier.
                </p>
                <label className="field-label" htmlFor="fixture">
                  Permitted test fixture{' '}
                  <Help text="Only fixture A or B can be accepted. The cloud backend generates its fixed synthetic content.">
                    <Icon name="info" size={14} />
                  </Help>
                </label>
                <select
                  id="fixture"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Choose a fixture</option>
                  {syntheticValues.map((v, i) => (
                    <option key={v} value={v}>
                      Fixture {i === 0 ? 'A' : 'B'} · {v}
                    </option>
                  ))}
                </select>
                <div className="callout">
                  <Icon name="shield" />
                  <span>
                    No real SIN field, arbitrary ciphertext upload or
                    private-key import is available.
                  </span>
                </div>
                <div className="flow-actions">
                  <Button onClick={() => setStage('instructions')}>Back</Button>
                  <Button
                    kind="primary"
                    icon="arrow"
                    disabled={!value}
                    title="Review the chosen fixture before the final submission"
                    onClick={() => setStage('review')}
                  >
                    Review information
                  </Button>
                </div>
              </>
            ) : stage === 'review' ? (
              <>
                <span className="flow-icon">
                  <Icon name="eye" size={25} />
                </span>
                <h2 id="flow-title">One final check.</h2>
                <p>
                  Review the synthetic fixture below. After the backend accepts
                  it, this invitation cannot submit again.
                </p>
                <div className="fixture-review">
                  <small>SYNTHETIC FIXTURE</small>
                  <strong>
                    {value === syntheticValues[0] ? 'Fixture A' : 'Fixture B'}
                  </strong>
                  <code>{value}</code>
                </div>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I reviewed this test fixture and understand that this
                  submission cannot be changed here.
                </label>
                <div className="flow-actions">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setConfirmed(false);
                      setStage('entry');
                    }}
                  >
                    Correct selection
                  </Button>
                  <Button
                    kind="primary"
                    icon="lock"
                    busy={busy}
                    disabled={!confirmed}
                    title="Submit this synthetic fixture once; wait for server confirmation"
                    onClick={() => void submit()}
                  >
                    Submit securely
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="success-ring">
                  <Icon name="check" size={32} />
                </span>
                <h2 id="flow-title">
                  {context.submitted
                    ? 'This invitation is complete.'
                    : 'Thank you. Your information has been submitted securely.'}
                </h2>
                <p>
                  No further action is required unless Morris Interactive
                  contacts you. Your submitted fixture is not displayed here.
                </p>
                <div className="completion-card">
                  <span>
                    <Icon name="check" />
                    Backend confirmed
                  </span>
                  <small>
                    Reference{' '}
                    <code>{context.reference.slice(0, 8).toUpperCase()}</code>
                  </small>
                </div>
                <Button kind="primary" onClick={signOut}>
                  Finish and sign out
                </Button>
              </>
            )}
          </section>
        </div>
        <footer className="public-footer">
          <span>
            <Icon name="shield" size={14} /> Morris Interactive · it starts with
            people
          </span>
          <span>Synthetic testing only. No real SIN collection.</span>
        </footer>
      </main>
    </div>
  );
}
