
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  userRole: UserRole | null; // admin, moderator, or user
  isLoadingAuth: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoadingAuth(true);
      setCurrentUser(user);
      if (user) {
        // Fetch UserProfile
        const userDocRef = doc(firestore, 'Users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserProfile(userDocSnap.data() as UserProfile);
        } else {
          setUserProfile(null); // Should not happen for a logged-in user
        }

        // Fetch UserRole (from admin_users collection)
        const adminRoleDocRef = doc(firestore, 'admin_users', user.uid);
        const adminRoleDocSnap = await getDoc(adminRoleDocRef);
        if (adminRoleDocSnap.exists()) {
          setUserRole(adminRoleDocSnap.data()?.role as UserRole);
        } else {
          setUserRole('user');
        }
      } else {
        setUserProfile(null);
        setUserRole(null);
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, userRole, isLoadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
