import supabase from './supabase';

export async function signInWithGoogle(_appName = 'SheetForge AI') {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error('[google-auth] OAuth error:', error.message);
}

export async function handleGoogleRedirect() {
  // intentional no-op — Supabase handles this automatically
}