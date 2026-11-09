import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
  api,
  login,
  logout,
  isLocal,
  warmClient,
  devLogin,
  message,
} from '../app/client';
import type { Context } from './types';
import { OwnerSetup } from './OwnerSetup';
import { Button, Icon } from './components';
const Dashboard = lazy(() => import('./Dashboard'));
const Contractor = lazy(() => import('./Contractor'));
export default function App() {
  const [context, setContext] = useState<Context | null>(null),
    [step, setStep] = useState('welcome'),
    [ownerSetup, setOwnerSetup] = useState<'activate' | 'window' | null>(null),
    [staff, setStaff] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  function notify(text: string, error = false) {
    setToast({ text, error });
  }
  async function signOut() {
    await logout();
    setContext(null);
    setStep('welcome');
    setOwnerSetup(null);
    setError('');
  }
  async function signIn(
    provider: 'microsoft.com' | 'google.com',
    fixture?: 'admin' | 'contractor',
  ) {
    setBusy(true);
    setError('');
    let providerAuthenticated = false;
    try {
      if (fixture) await devLogin(fixture);
      else await login(provider, staff);
      providerAuthenticated = true;
      const c = await api<Context>('portalContext');
      if (!isLocal && staff && c.kind === 'admin' && c.workspace !== 'staff' && !c.permissions?.administratorManagement) {
        const setup = await api('portalOwnerSetupStatus').catch(() => null);
        if (setup) {
          setOwnerSetup('activate');
          return;
        }
      }
      setContext(c);
      setStep('authorized');
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (!isLocal && providerAuthenticated && staff &&
          ['functions/failed-precondition', 'functions/permission-denied'].includes(code || '')) {
        try {
          await api('portalOwnerWindow');
          setOwnerSetup('window');
          return;
        } catch {
          try {
            await api('portalOwnerSetupStatus');
            setOwnerSetup('activate');
            return;
          } catch {
            // The sign-in error below remains generic for ineligible accounts.
          }
        }
      }
      await logout();
      setContext(null);
      setError(
        providerAuthenticated
          ? `Sign-in completed, but portal access was not approved. ${message(e)}`
          : message(e),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (step === 'signin')
      void warmClient()
        .then(() => setReady(true))
        .catch(() =>
          setError(
            'The secure sign-in module could not load. Check your connection and retry.',
          ),
        );
  }, [step]);
  useEffect(() => {
    if (!context) return;
    const timer = setInterval(() => {
      void api<Context>('portalContext')
        .then((c) => setContext(c))
        .catch(() => {
          void signOut();
          setError(
            'Your portal authorization changed or expired. Please sign in again.',
          );
        });
    }, 60000);
    return () => clearInterval(timer);
  }, [context?.kind]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (context) {
          void signOut();
          setError('Your session expired after ten minutes of inactivity.');
        }
      }, 600000);
    };
    touch();
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [context?.kind]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <>
      <div
        className="test-ribbon"
        role="region"
        aria-label="Environment restrictions"
      >
        <span>
          <i />
          {context?.workspace === 'staff' ? 'STAFF WORKSPACE · SIN COLLECTION DISABLED' : 'SYNTHETIC TEST ENVIRONMENT'}
        </span>
        <span>
          Real SIN collection, retrieval and disposal remain disabled.
        </span>
      </div>
      {ownerSetup ? (
        <OwnerSetup mode={ownerSetup} api={api} signOut={() => void signOut()}
          continueToPortal={async () => {
            const result = await api<Context>('portalContext');
            setContext(result);
            setOwnerSetup(null);
          }} />
      ) : context ? (
        <Suspense
          fallback={
            <div className="app-loading" role="status">
              <span className="spinner" />
              Opening your secure workspace…
            </div>
          }
        >
          {context.kind === 'admin' ? (
            <Dashboard
              context={context}
              api={api}
              notify={notify}
              signOut={() => void signOut()}
            />
          ) : (
            <Contractor
              context={context}
              api={api}
              local={isLocal}
              onContext={setContext}
              notify={notify}
              signOut={() => void signOut()}
            />
          )}
        </Suspense>
      ) : (
        <div className="welcome-shell">
          <a href="#welcome-main" className="skip">
            Skip to content
          </a>
          <header className="public-header">
            <img
              src="/brand/mi-logo-white.png"
              alt="Morris Interactive · it starts with people"
            />
            <span>
              <Icon name="lock" size={14} /> Secure collection portal
            </span>
            <Button
              title="Microsoft organizational authentication and an explicitly approved MI role are required"
              onClick={() => {
                setStaff(true);
                setStep('signin');
              }}
            >
              MI staff access <Icon name="arrow" size={14} />
            </Button>
          </header>
          <main id="welcome-main" className="welcome-main">
            <section className="welcome-copy">
              <div className="eyebrow">
                <span className="little-rule" />
                It starts with people.
              </div>
              <h1>
                A private place
                <br />
                for important
                <br />
                <em>information.</em>
              </h1>
              <p>
                A considered, secure collection experience.
                <br />
                Clear steps. Verified access. Careful handling.
              </p>
              <div className="welcome-assurance">
                <span>
                  <Icon name="shield" />
                  Approved identities only
                </span>
                <span>
                  <Icon name="lock" />
                  Protected by design
                </span>
              </div>
              <div className="welcome-decoration" aria-hidden="true">
                <div />
                <div />
                <div />
              </div>
            </section>
            <section className="welcome-card" aria-labelledby="welcome-title">
              <div className="welcome-card-header">
                <span className="flow-icon">
                  <Icon
                    name={step === 'welcome' ? 'shield' : 'lock'}
                    size={24}
                  />
                </span>
                <span className="muted">
                  {step === 'welcome'
                    ? 'YOUR SECURE START'
                    : staff
                      ? 'MI ADMINISTRATOR ACCESS'
                      : 'VERIFIED CONTRACTOR ACCESS'}
                </span>
              </div>
              {error && (
                <div className="inline-error" role="alert">
                  <Icon name="alert" />
                  <p>{error}</p>
                  <Button
                    onClick={() => {
                      setError('');
                      setStep('signin');
                      void warmClient().then(() => setReady(true));
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
              {step === 'welcome' ? (
                <>
                  <h2 id="welcome-title">Welcome to the secure portal.</h2>
                  <p>
                    This review environment lets approved people test the
                    collection journey using two fixed synthetic fixtures.
                  </p>
                  <div className="welcome-points">
                    <div>
                      <span>01</span>
                      <div>
                        <strong>Sign in with a trusted provider</strong>
                        <p>Use your approved Microsoft or Google identity.</p>
                      </div>
                    </div>
                    <div>
                      <span>02</span>
                      <div>
                        <strong>Confirm your eligibility</strong>
                        <p>
                          Your invitation and email ownership are checked by the
                          backend.
                        </p>
                      </div>
                    </div>
                    <div>
                      <span>03</span>
                      <div>
                        <strong>Review, then submit once</strong>
                        <p>No real SIN is accepted during this test.</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    kind="primary"
                    icon="arrow"
                    onClick={() => {
                      setStaff(false);
                      setStep('signin');
                    }}
                  >
                    Continue to secure sign-in
                  </Button>
                  <p className="fine-print">
                    Before real collection, Morris Interactive must approve the
                    business purpose, privacy notice, retention period and
                    privacy contact.
                  </p>
                </>
              ) : (
                <>
                  <h2 id="welcome-title">
                    {staff
                      ? 'Your MI workspace awaits.'
                      : 'Let’s verify your access.'}
                  </h2>
                  <p>
                    {staff
                      ? 'Use your approved Microsoft organizational identity. Company email alone does not grant a role.'
                      : 'Choose your approved account. Signing in alone does not grant portal access.'}
                  </p>
                  <div className="signin-actions">
                    <Button
                      kind="primary provider-button"
                      disabled={!ready}
                      busy={busy}
                      onClick={() => void signIn('microsoft.com')}
                    >
                      <span className="ms-symbol">▦</span> Continue with
                      Microsoft
                    </Button>
                    {!staff && (
                      <Button
                        kind="provider-button"
                        disabled={!ready || busy}
                        onClick={() => void signIn('google.com')}
                      >
                        <strong>G</strong> Continue with Google
                      </Button>
                    )}
                  </div>
                  {!ready && (
                    <p role="status" className="loading-note">
                      <span className="spinner" />
                      Preparing secure sign-in…
                    </p>
                  )}
                  <div className="callout">
                    <Icon name="lock" />
                    <span>
                      {staff
                        ? 'Explicit UID, tenant and Entra object bindings are verified server-side.'
                        : 'Your exact approved email must match an active invitation. Account conflicts never trigger automatic linking.'}
                    </span>
                  </div>
                  <Button
                    onClick={() => {
                      setStep('welcome');
                      setError('');
                    }}
                    disabled={busy}
                  >
                    ← Back to overview
                  </Button>
                  {import.meta.env.DEV && isLocal && (
                    <details className="local-review">
                      <summary>Local synthetic review</summary>
                      <p>
                        These controls use seeded Auth emulator identities only.
                        They are absent from cloud builds.
                      </p>
                      <Button
                        disabled={busy || !ready}
                        onClick={() => void signIn('microsoft.com', 'admin')}
                      >
                        Open synthetic administrator
                      </Button>
                      <Button
                        disabled={busy || !ready}
                        onClick={() =>
                          void signIn('microsoft.com', 'contractor')
                        }
                      >
                        Open synthetic contractor
                      </Button>
                    </details>
                  )}
                </>
              )}
              <div className="card-footer">
                <Icon name="shield" size={14} />
                <span>Morris Interactive · Secure SIN Collection Portal</span>
              </div>
            </section>
          </main>
          <footer className="public-footer">
            <span>© {new Date().getFullYear()} Morris Interactive</span>
            <span>It starts with people.</span>
            <span>
              <Icon name="lock" size={13} />
              Synthetic testing only
            </span>
          </footer>
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <Icon name={toast.error ? 'alert' : 'check'} />
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </>
  );
}
