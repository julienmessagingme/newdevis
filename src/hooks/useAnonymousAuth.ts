import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthState = {
  user: any | null;
  isAnonymous: boolean;
  isPermanent: boolean;
  loading: boolean;
};

type ConvertParams = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  acceptCommercial?: boolean;
};

// Detect if a user is anonymous: check is_anonymous flag OR absence of email
function checkIsAnonymous(user: any): boolean {
  if (user.is_anonymous === true) return true;
  // Fallback: anonymous users have no email
  if (!user.email) return true;
  return false;
}

export function useAnonymousAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAnonymous: false,
    isPermanent: false,
    loading: true,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const anon = checkIsAnonymous(user);
        setState({
          user,
          isAnonymous: anon,
          isPermanent: !anon,
          loading: false,
        });
      } else {
        setState(prev => ({ ...prev, user: null, loading: false }));
      }
    };
    init();
  }, []);

  const signInAnonymously = useCallback(async () => {
    // If already signed in (anonymous or permanent), reuse
    const { data: { user: existing } } = await supabase.auth.getUser();
    if (existing) {
      const anon = checkIsAnonymous(existing);
      setState({
        user: existing,
        isAnonymous: anon,
        isPermanent: !anon,
        loading: false,
      });
      return existing;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("Anonymous sign-in failed:", error);
      return null;
    }

    const user = data.user;
    setState({
      user,
      isAnonymous: true,
      isPermanent: false,
      loading: false,
    });
    return user;
  }, []);

  const convertToPermanent = useCallback(async (params: ConvertParams) => {
    const phoneDigits = params.phone.replace(/\D/g, "");

    const { data, error } = await supabase.auth.updateUser({
      email: params.email,
      password: params.password,
      data: {
        first_name: params.firstName,
        last_name: params.lastName,
        phone: phoneDigits,
        accept_commercial_offers: params.acceptCommercial ?? false,
      },
    });

    if (error) {
      throw error;
    }

    const user = data.user;
    setState({
      user,
      isAnonymous: false,
      isPermanent: true,
      loading: false,
    });
    return user;
  }, []);

  return {
    ...state,
    signInAnonymously,
    convertToPermanent,
  };
}
