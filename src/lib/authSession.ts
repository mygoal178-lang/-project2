/**
 * Supabase session helpers for OrderFlow.
 * Production: real session from Supabase Auth.
 * Demo: only when VITE_SUPABASE_* is not configured.
 */
import { supabase, isSupabaseConfigured } from './supabase';
import type { UserProfile, Role } from '../types';

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
    // Prefer profile row when available
    let full_name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'User';
    let role: Role = 'staff'; // never default to owner from client alone
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
    try {
      const { data: memberships } = await supabase
        .from('business_members')
        .select('role, status, business_id')
        .eq('user_id', u.id)
        .eq('status', 'active')
        .limit(20);
      if (memberships && memberships.length > 0) {
        // Do NOT elevate to the highest role across unrelated workspaces.
        // UI must set role from the *active* workspace membership after workspace load.
        // Temporary default remains staff until App applies the selected workspace membership.
        role = 'staff';
      }
    } catch {
      /* membership lookup optional during bootstrap */
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
      callback(null);
      return;
    }
    const profile = await getSessionUser();
    callback(profile);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
