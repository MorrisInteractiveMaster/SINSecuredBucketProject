const target = {
  projectId: 'gen-lang-client-0948635471',
  appId: '1:1025148630135:web:75e07aa9dd751cc25e0272',
  authDomain: 'gen-lang-client-0948635471.firebaseapp.com',
};
export function clientConfiguration(env) {
  const mode = env.VITE_PORTAL_MODE || 'emulator';
  if (mode === 'emulator')
    return {
      mode,
      firebase: {
        projectId: 'demo-mi-sin-portal',
        apiKey: 'emulator-only',
        authDomain: 'demo-mi-sin-portal.firebaseapp.com',
        appId: 'emulator-only',
      },
    };
  if (
    mode !== 'cloud-test' ||
    env.VITE_REAL_COLLECTION_ENABLED !== 'false' ||
    Object.entries(target).some(
      ([k, v]) =>
        env[
          {
            projectId: 'VITE_FIREBASE_PROJECT_ID',
            appId: 'VITE_FIREBASE_APP_ID',
            authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
          }[k]
        ] !== v,
    ) ||
    !/^AIza[0-9A-Za-z_-]{35}$/.test(env.VITE_FIREBASE_API_KEY || '') ||
    !/^6[0-9A-Za-z_-]{20,}$/.test(env.VITE_APPCHECK_SITE_KEY || '') ||
    !/^[a-f0-9-]{36}$/i.test(env.VITE_MI_TENANT_ID || '')
  )
    throw new Error(
      'Cloud-test configuration is incomplete; real collection is never enabled.',
    );
  return {
    mode,
    appCheckSiteKey: env.VITE_APPCHECK_SITE_KEY,
    firebase: { ...target, apiKey: env.VITE_FIREBASE_API_KEY },
  };
}
