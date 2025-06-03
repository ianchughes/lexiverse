
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
        const userDocRef = doc(firestore, 'Users', user.uid);
        
        const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Validate essential fields before setting userProfile
            if (data && data.username && data.email && data.registrationCountry && data.accountStatus && data.dateCreated) {
              setUserProfile(data as UserProfile);
            } else {
              console.warn("UserProfile data from Firestore is incomplete or missing essential fields for UID:", user.uid, data);
              setUserProfile(null); 
            }
          } else {
            console.warn("UserProfile document does not exist for UID:", user.uid);
            setUserProfile(null);
          }
        }, (error) => {
          console.error("Error fetching user profile snapshot:", error);
          setUserProfile(null);
        });
        
        const adminRoleDocRef = doc(firestore, 'admin_users', user.uid);
        try {
            const adminRoleDocSnap = await getDoc(adminRoleDocRef);
            if (adminRoleDocSnap.exists()) {
              setUserRole(adminRoleDocSnap.data()?.role as UserRole);
            } else {
              setUserRole('user');
            }
        } catch (roleError) {
            console.error("Error fetching user role:", roleError);
            setUserRole('user'); // Default to 'user' on error
        }
        
        setIsLoadingAuth(false);
        return () => unsubscribeProfile(); 
      } else {
        setUserProfile(null);
        setUserRole(null);
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribeAuth();
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
