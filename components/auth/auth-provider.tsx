"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Permission } from "@/lib/rbac/permissions";
import type { Database } from "@/lib/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Role = Database["public"]["Tables"]["roles"]["Row"];

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: string[];
  permissions: Permission[];
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  roles: [],
  permissions: [],
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (userId: string) => {
    const [{ data: profileData }, { data: userRolesData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("user_roles")
        .select("role_id, roles!inner(code)")
        .eq("user_id", userId),
    ]);

    setProfile(profileData as Profile | null);

    const roleCodes = (userRolesData as unknown as { roles: { code: string } }[])?.map(
      (ur) => ur.roles.code
    ) ?? [];
    setRoles(roleCodes);

    if (roleCodes.length > 0) {
      const { data: rolePerms } = await supabase
        .from("role_permissions")
        .select("permission_id, permissions!inner(code)")
        .in(
          "role_id",
          (userRolesData as unknown as { role_id: string }[])?.map((ur) => ur.role_id) ?? []
        );

      const permCodes = (rolePerms as unknown as { permissions: { code: string } }[])?.map(
        (rp) => rp.permissions.code as Permission
      ) ?? [];
      setPermissions(permCodes);
    } else {
      setPermissions([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await loadUserData(s.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user && event !== "SIGNED_OUT") {
        await loadUserData(s.user.id);
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setPermissions([]);
    window.location.href = "/auth/login";
  }, []);

  const refresh = useCallback(async () => {
    if (user) {
      await loadUserData(user.id);
    }
  }, [user, loadUserData]);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, roles, permissions, loading, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
