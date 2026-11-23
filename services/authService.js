// services/authService.js
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { ref, get, set, update, remove, runTransaction } from 'firebase/database';
import { auth, db } from './firebase';
import { INITIAL_COINS } from '../utils/constants';

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const INTERNAL_EMAIL_DOMAIN = 'users.guessthedrawing.app';

export const normalizeUsername = (username) =>
  String(username || '').trim().toLowerCase();

export const validateUsername = (username) => {
  const clean = normalizeUsername(username);
  if (!USERNAME_REGEX.test(clean)) {
    throw new Error(
      'Username must be 3–20 characters using only letters, numbers, or underscores.'
    );
  }
  return clean;
};

const toInternalEmail = (cleanUsername) =>
  `${cleanUsername}@${INTERNAL_EMAIL_DOMAIN}`;

export const ensureUserProfile = async (user, extraData = {}) => {
  if (!user?.uid) return null;
  const userRef = ref(db, `users/${user.uid}`);

  try {
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
      const existing = snapshot.val();
      const mergedUpdates = {};
      if (extraData.name && !existing.name) {
        mergedUpdates.name = extraData.name.trim();
        mergedUpdates.isNameSet = true;
      }
      if (extraData.username && !existing.username) {
        mergedUpdates.username = extraData.username;
      }
      if (Object.keys(mergedUpdates).length > 0) {
        await update(userRef, mergedUpdates);
        return { ...existing, ...mergedUpdates };
      }
      return existing;
    }

    const displayName =
      (extraData.name && extraData.name.trim()) || `Player_${user.uid.slice(0, 4)}`;

    const newProfile = {
      uid: user.uid,
      name: displayName,
      username: extraData.username || null,
      coins: INITIAL_COINS,
      gamesPlayed: 0,
      gamesWon: 0,
      totalPoints: 0,
      createdAt: Date.now(),
      isNameSet: Boolean(extraData.name && extraData.name.trim()),
    };

    await set(userRef, newProfile);

    const txId = `init_${user.uid}`;
    await set(ref(db, `coinTransactions/${txId}`), {
      transactionId: txId,
      uid: user.uid,
      type: 'initial_bonus',
      amount: INITIAL_COINS,
      previousBalance: 0,
      updatedBalance: INITIAL_COINS,
      roomId: null,
      roundId: null,
      timestamp: Date.now(),
    });

    return newProfile;
  } catch (error) {
    console.error('Error ensuring user profile:', error);
    throw error;
  }
};

export const registerWithUsername = async ({ name, username, password }) => {
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2 || cleanName.length > 30) {
    throw new Error('Please enter your name (2–30 characters).');
  }

  const cleanUsername = validateUsername(username);

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const usernameRef = ref(db, `usernames/${cleanUsername}`);
  const internalEmail = toInternalEmail(cleanUsername);
  let reservedByThisCall = false;
  let createdAuthUser = null;

  try {
    const existingSnap = await get(usernameRef);
    if (existingSnap.exists()) {
      throw new Error('That username is already taken. Please choose another.');
    }

    const txResult = await runTransaction(usernameRef, (currentData) => {
      if (currentData !== null) {
        return; // Abort transaction: username already exists
      }
      return {
        username: cleanUsername,
        email: internalEmail,
        reservedAt: Date.now(),
      };
    });

    if (!txResult.committed) {
      throw new Error('That username is already taken. Please choose another.');
    }
    reservedByThisCall = true;

    const credential = await createUserWithEmailAndPassword(
      auth,
      internalEmail,
      password
    );
    createdAuthUser = credential.user;

    const profile = await ensureUserProfile(createdAuthUser, {
      name: cleanName,
      username: cleanUsername,
    });

    await set(usernameRef, {
      uid: createdAuthUser.uid,
      username: cleanUsername,
      email: internalEmail,
      createdAt: Date.now(),
    });

    return profile;
  } catch (error) {
    if (reservedByThisCall && !createdAuthUser) {
      await remove(usernameRef).catch(() => {});
    }

    if (error?.code === 'auth/email-already-in-use') {
      throw new Error('That username is already taken. Please choose another.');
    }
    if (error?.code === 'auth/weak-password') {
      throw new Error('Password must be at least 6 characters.');
    }
    if (error?.code === 'auth/network-request-failed') {
      throw new Error('Network error. Check your connection and try again.');
    }
    if (error?.code === 'PERMISSION_DENIED') {
      throw new Error(
        'Database permission denied while saving username. Check Realtime Database rules.'
      );
    }

    console.error('Error registering user:', error);
    throw error;
  }
};

export const loginWithUsername = async ({ username, password }) => {
  const cleanUsername = validateUsername(username);
  if (!password) {
    throw new Error('Please enter your password.');
  }

  try {
    const usernameRef = ref(db, `usernames/${cleanUsername}`);
    const usernameSnap = await get(usernameRef);

    if (!usernameSnap.exists()) {
      throw new Error('Invalid username or password.');
    }

    const usernameRecord = usernameSnap.val() || {};
    const loginEmail = usernameRecord.email || toInternalEmail(cleanUsername);

    const credential = await signInWithEmailAndPassword(
      auth,
      loginEmail,
      password
    );

    const profile = await ensureUserProfile(credential.user, {
      username: cleanUsername,
    });

    if (usernameRecord.uid && usernameRecord.uid !== credential.user.uid) {
      console.warn('Username record UID differed from authenticated UID.');
    }

    return profile;
  } catch (error) {
    if (
      error?.code === 'auth/invalid-credential' ||
      error?.code === 'auth/user-not-found' ||
      error?.code === 'auth/wrong-password'
    ) {
      throw new Error('Invalid username or password.');
    }
    if (error?.code === 'auth/too-many-requests') {
      throw new Error('Too many login attempts. Please try again later.');
    }
    if (error?.code === 'auth/network-request-failed') {
      throw new Error('Network error. Check your connection and try again.');
    }
    if (error?.code === 'PERMISSION_DENIED') {
      throw new Error(
        'Database permission denied while looking up username. Check Realtime Database rules.'
      );
    }

    console.error('Error logging in:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// Kept for backward compatibility with existing profile updates
export const updateUsername = async (uid, newName) => {
  try {
    await update(ref(db, `users/${uid}`), {
      name: String(newName || '').trim(),
      isNameSet: true,
    });
  } catch (error) {
    console.error('Error updating username:', error);
    throw error;
  }
};