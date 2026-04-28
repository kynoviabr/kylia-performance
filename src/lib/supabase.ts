import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) {
    return { error: new Error("Supabase is not configured.") };
  }

  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  if (!supabase) {
    return { error: new Error("Supabase is not configured.") };
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
}

export async function signInWithGoogle() {
  if (!supabase) {
    return { error: new Error("Supabase is not configured.") };
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
}

export async function signOut() {
  if (!supabase) {
    return { error: new Error("Supabase is not configured.") };
  }

  return supabase.auth.signOut();
}
