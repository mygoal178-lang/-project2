/**
 * Supabase session helpers for OrderFlow.
 * Production: real session from Supabase Auth.
 * Demo: only when VITE_SUPABASE_* is not configured.
 * Role is never taken as max across workspaces — defaults to staff until
 * App applies the active workspace membership.
 */
import { supabase, isSupabaseConfigured } from './supabase';
import type { UserProfile, Role } from '../types';
import { setStorageUserScope, clearCurrentUserScope } from './storageScope';

export function isDemoMode(): boolean {
  return !isSupabaseConfigured;
}

/** Explicit opt-in demo mode via env (default off when Supabase is configured). */
export function isDemoExplicitlyEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_DEMO_MODE === 'true' || isDemoMode();
}

export async function getSessionUser(): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;
    const u = data.session.user;

    // Isolate any client cache by user id
    setStorageUserScope(u.id);

    let full_name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'User';
    // never default to owner from client alone
    const role: Role = 'staff';

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', u.id)
        .maybeSingle();
      if (profile?.full_name) full_name = profile.full_name;
    } catch {
      /* profiles table may not be reachable yet */
    }

    // Memberships are loaded for bootstrap; role for UI comes from active workspace only
    try {
      await supabase
        .from('business_members')
        .select('role, status, business_id')
        .eq('user_id', u.id)
        .eq('status', 'active')
        .limit(20);
    } catch {
      /* optional during bootstrap */
    }

    return {
      id: u.id,
      email: u.email || '',
      full_name,
      role,
      preferred_language: (u.user_metadata?.preferred_language as any) || 'en',
      created_at: u.created_at || new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    clearCurrentUserScope();
  } catch {
    /* ignore */
  }
  setStorageUserScope(null);
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export function subscribeAuth(callback: (user: UserProfile | null) => void): () => void {
  if (!supabase) {
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session?.user) {
      try {
        clearCurrentUserScope();
      } catch {
        /* ignore */
      }
      setStorageUserScope(null);
      callback(null);
      return;
    }
    setStorageUserScope(session.user.id);
    const profile = await getSessionUser();
    callback(profile);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
