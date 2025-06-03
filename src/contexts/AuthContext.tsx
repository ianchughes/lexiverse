
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore'; // Added onSnapshot
import { auth, firestore } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  userRole: UserRole | null; // admin, moderator, or user
  isLoadingAuth: boolean;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>; // Expose setUserProfile
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setIsLoadingAuth(true);
      setCurrentUser(user);
      if (user) {
        // Fetch UserProfile and listen for real-time updates
        const userDocRef = doc(firestore, 'Users', user.uid);
        // Listen for real-time updates to userProfile
        const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        }, (error) => {
          console.error("Error fetching user profile:", error);
          setUserProfile(null);
        });
        
        // Fetch UserRole (from admin_users collection) - this typically doesn't need real-time updates
        const adminRoleDocRef = doc(firestore, 'admin_users', user.uid);
        const adminRoleDocSnap = await getDoc(adminRoleDocRef);
        if (adminRoleDocSnap.exists()) {
          setUserRole(adminRoleDocSnap.data()?.role as UserRole);
        } else {
          setUserRole('user');
        }
        setIsLoadingAuth(false); // Set loading to false after initial fetch
        return () => unsubscribeProfile(); // Cleanup profile listener on user change or unmount
      } else {
        setUserProfile(null);
        setUserRole(null);
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribeAuth(); // Cleanup auth listener on component unmount
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, userRole, isLoadingAuth, setUserProfile }}>
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
