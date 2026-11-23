// hooks/useAuth.js
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { auth, db } from '../services/firebase';
import { ensureUserProfile } from '../services/authService';

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(true);
        try {
          await ensureUserProfile(currentUser);
        } catch (err) {
          console.error('Profile sync error:', err);
          setLoading(false);
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      return;
    }

    const profileRef = ref(db, `users/${user.uid}`);
    const unsubscribe = onValue(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile(snapshot.val());
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Profile listener error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { user, profile, loading };
}