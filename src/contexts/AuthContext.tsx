import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextType = {
    session: Session | null;
    user: User | null;
    // The account whose data (clientes, produtos, OS, estoque...) should be read/written.
    // Equal to user.id for the account owner; equal to the owner's id for a team member
    // logged in with their own login (see team_members / current_tenant_id() in Supabase).
    // Every query/insert scoped by "user_id" must use this instead of user.id, or a team
    // member's session ends up reading/writing their own empty tenant instead of the shop's data.
    tenantId: string | null;
    loading: boolean;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    tenantId: null,
    loading: true,
    signOut: async () => { },
});

export const useAuth = () => {
    return useContext(AuthContext);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active session
        const initAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;

                setSession(session);
                setUser(session?.user ?? null);
            } catch (error) {
                console.error('Error checking auth session:', error);
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log('Auth state changed:', _event, session);
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Resolves the tenant separately from the session: a team member's own uid isn't
    // the id under which shop data is stored, so this looks up the owner via
    // team_members (mirrors the current_tenant_id() SQL function used by RLS).
    useEffect(() => {
        if (!user) {
            setTenantId(null);
            return;
        }

        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('team_members')
                .select('owner_id')
                .eq('member_user_id', user.id)
                .maybeSingle();
            if (!cancelled) setTenantId(data?.owner_id || user.id);
        })();

        return () => { cancelled = true; };
    }, [user]);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    const value = {
        session,
        user,
        tenantId,
        loading,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
