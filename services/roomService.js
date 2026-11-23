// services/roomService.js
import { ref, set, get, update } from 'firebase/database';
import { db } from './firebase';

// Generate a random 4-letter room code (excluding confusing characters)
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed O, 0, I, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const createRoom = async (hostProfile, settings) => {
  try {
    let roomCode = generateRoomCode();
    let roomExists = true;

    while (roomExists) {
      const checkRef = ref(db, `rooms/${roomCode}`);
      const snapshot = await get(checkRef);
      if (!snapshot.exists()) {
        roomExists = false;
      } else {
        roomCode = generateRoomCode();
      }
    }

    const roomData = {
      roomCode,
      hostId: hostProfile.uid,
      status: 'waiting',
      settings: {
        maxPlayers: settings.maxPlayers,
        rounds: settings.rounds,
        mode: settings.mode,
        entryCost: settings.mode === 'coin' ? 1 : 0,
      },
      createdAt: Date.now(),
    };

    await set(ref(db, `rooms/${roomCode}`), roomData);

    await set(ref(db, `roomPlayers/${roomCode}/${hostProfile.uid}`), {
      uid: hostProfile.uid,
      name: hostProfile.name,
      coins: hostProfile.coins,
      score: 0,
      isHost: true,
      joinedAt: Date.now(),
    });

    return roomCode;
  } catch (error) {
    console.error('Error creating room:', error);
    throw error;
  }
};

export const joinRoom = async (roomCode, playerProfile) => {
  try {
    const upperCode = String(roomCode || '').trim().toUpperCase();

    const roomRef = ref(db, `rooms/${upperCode}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      throw new Error('Room not found. Check the code.');
    }

    const roomData = snapshot.val();

    if (roomData.status !== 'waiting') {
      throw new Error('Game has already started.');
    }

    const playersRef = ref(db, `roomPlayers/${upperCode}`);
    const playersSnap = await get(playersRef);
    const currentPlayers = playersSnap.exists() ? Object.keys(playersSnap.val()).length : 0;

    if (currentPlayers >= roomData.settings.maxPlayers) {
      throw new Error('Room is full.');
    }

    if (playersSnap.exists() && playersSnap.val()[playerProfile.uid]) {
      return upperCode;
    }

    if (roomData.settings.mode === 'coin') {
      if (playerProfile.coins < roomData.settings.entryCost) {
        throw new Error(`Not enough coins. You need ${roomData.settings.entryCost}.`);
      }
    }

    await set(ref(db, `roomPlayers/${upperCode}/${playerProfile.uid}`), {
      uid: playerProfile.uid,
      name: playerProfile.name,
      coins: playerProfile.coins,
      score: 0,
      isHost: false,
      joinedAt: Date.now(),
    });

    return upperCode;
  } catch (error) {
    console.error('Join room error:', error);
    throw error;
  }
};

export const startGame = async (roomCode, players) => {
  try {
    if (!players || players.length < 2) {
      throw new Error('Need at least 2 players to start.');
    }

    const sortedPlayers = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
    const turnOrder = sortedPlayers.map((p) => p.uid);

    const { getRandomWord } = require('../utils/words');
    const secretWord = getRandomWord();

    const updates = {};
    updates[`rooms/${roomCode}/status`] = 'playing';
    updates[`rooms/${roomCode}/currentRound`] = 1;
    updates[`rooms/${roomCode}/turnOrder`] = turnOrder;
    updates[`rooms/${roomCode}/currentDrawerId`] = turnOrder[0];
    updates[`rooms/${roomCode}/currentWord`] = secretWord;
    updates[`rooms/${roomCode}/roundStartedAt`] = Date.now();
    updates[`rooms/${roomCode}/timeLimit`] = 60;
    updates[`drawings/${roomCode}`] = null;

    players.forEach((p) => {
      updates[`roomPlayers/${roomCode}/${p.uid}/score`] = 0;
      updates[`roomPlayers/${roomCode}/${p.uid}/hasGuessedCorrectly`] = false;
    });

    await update(ref(db), updates);
    return true;
  } catch (error) {
    console.error('Start game error:', error);
    throw error;
  }
};

export const submitGuess = async (roomCode, playerUid, drawerUid, guessText, secretWord, alreadyGuessed) => {
  try {
    const cleanGuess = guessText.trim().toLowerCase();
    const cleanSecret = secretWord.trim().toLowerCase();

    if (alreadyGuessed) return { success: false, message: 'Already guessed!' };

    if (cleanGuess === cleanSecret) {
      const playersRef = ref(db, `roomPlayers/${roomCode}`);
      const snapshot = await get(playersRef);

      if (snapshot.exists()) {
        const players = snapshot.val();
        const currentGuesserScore = players[playerUid]?.score || 0;
        const currentDrawerScore = players[drawerUid]?.score || 0;

        const updates = {};
        updates[`roomPlayers/${roomCode}/${playerUid}/score`] = currentGuesserScore + 100;
        updates[`roomPlayers/${roomCode}/${playerUid}/hasGuessedCorrectly`] = true;

        updates[`roomPlayers/${roomCode}/${drawerUid}/score`] = currentDrawerScore + 50;

        await update(ref(db), updates);
        return { success: true, message: 'Correct!' };
      }
    }

    return { success: false, message: 'Wrong guess, try again!' };
  } catch (error) {
    console.error('Guess error:', error);
    return { success: false, message: 'Error submitting guess.' };
  }
};

export const nextTurn = async (roomCode) => {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return;

  const room = snap.val();
  const turnOrder = room.turnOrder || [];
  const currentIndex = turnOrder.indexOf(room.currentDrawerId);

  if (currentIndex === turnOrder.length - 1) {
    if (room.currentRound >= room.settings.rounds) {
      await update(ref(db, `rooms/${roomCode}`), { status: 'ended' });
      return;
    }

    const { getRandomWord } = require('../utils/words');
    const newWord = getRandomWord();
    const updates = {};
    updates[`rooms/${roomCode}/currentRound`] = room.currentRound + 1;
    updates[`rooms/${roomCode}/currentDrawerId`] = turnOrder[0];
    updates[`rooms/${roomCode}/currentWord`] = newWord;
    updates[`rooms/${roomCode}/roundStartedAt`] = Date.now();
    updates[`drawings/${roomCode}`] = null;

    const playersRef = ref(db, `roomPlayers/${roomCode}`);
    const playersSnap = await get(playersRef);
    if (playersSnap.exists()) {
      Object.keys(playersSnap.val()).forEach((uid) => {
        updates[`roomPlayers/${roomCode}/${uid}/hasGuessedCorrectly`] = false;
      });
    }
    await update(ref(db), updates);
  } else {
    const nextDrawerId = turnOrder[currentIndex + 1];
    const { getRandomWord } = require('../utils/words');
    const newWord = getRandomWord();

    const updates = {};
    updates[`rooms/${roomCode}/currentDrawerId`] = nextDrawerId;
    updates[`rooms/${roomCode}/currentWord`] = newWord;
    updates[`rooms/${roomCode}/roundStartedAt`] = Date.now();
    updates[`drawings/${roomCode}`] = null;

    const playersRef = ref(db, `roomPlayers/${roomCode}`);
    const playersSnap = await get(playersRef);
    if (playersSnap.exists()) {
      Object.keys(playersSnap.val()).forEach((uid) => {
        updates[`roomPlayers/${roomCode}/${uid}/hasGuessedCorrectly`] = false;
      });
    }
    await update(ref(db), updates);
  }
};

// Process Coin Payouts at the End of the Game:
// - Top scorer(s) keep their entry coin and share all losers' entry coins equally.
// - Non-first-place players lose their entry coin.
// - If everyone ties for 1st place, nobody loses or gains coins.
export const processCoinPayout = async (roomCode, players, winnerUid = null) => {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return;

  const room = snap.val();

  if (room.settings?.mode !== 'coin' || room.payoutDone) return;
  if (!Array.isArray(players) || players.length === 0) return;

  const entryCost = Number(room.settings.entryCost) || 1;
  const now = Date.now();

  const latestPlayers = await Promise.all(
    players.map(async (p) => {
      let score = Number(p.score) || 0;
      let currentCoins = Number(p.coins) || 0;

      try {
        const scoreSnap = await get(ref(db, `roomPlayers/${roomCode}/${p.uid}/score`));
        if (scoreSnap.exists() && Number.isFinite(Number(scoreSnap.val()))) {
          score = Number(scoreSnap.val());
        }
      } catch (err) {
        console.error(`Failed to read latest score for ${p.uid}:`, err);
      }

      try {
        const coinsSnap = await get(ref(db, `users/${p.uid}/coins`));
        if (coinsSnap.exists() && Number.isFinite(Number(coinsSnap.val()))) {
          currentCoins = Number(coinsSnap.val());
        }
      } catch (err) {
        console.error(`Failed to read latest coins for ${p.uid}:`, err);
      }

      return {
        ...p,
        score,
        currentCoins,
      };
    })
  );

  // Sort by score descending, then joinedAt ascending for deterministic tie order
  const ordered = [...latestPlayers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });

  const highestScore = ordered[0].score;
  const winners = ordered.filter((p) => p.score === highestScore);
  const losers = ordered.filter((p) => p.score < highestScore);

  const updates = {};
  const payoutSummary = {};

  // Everyone tied for 1st place -> all coins stay with themselves
  if (losers.length === 0) {
    ordered.forEach((p) => {
      payoutSummary[p.uid] = {
        uid: p.uid,
        name: p.name,
        score: p.score,
        delta: 0,
        previousCoins: p.currentCoins,
        updatedCoins: p.currentCoins,
        outcome: 'draw',
      };
    });

    updates[`rooms/${roomCode}/payoutDone`] = true;
    updates[`rooms/${roomCode}/payoutOutcome`] = 'draw';
    updates[`rooms/${roomCode}/payoutSummary`] = payoutSummary;
    await update(ref(db), updates);
    return;
  }

  // Deduct entryCost from each loser
  let totalPoolFromLosers = 0;
  losers.forEach((loser) => {
    const deducted = Math.min(loser.currentCoins, entryCost);
    const updatedCoins = loser.currentCoins - deducted;
    totalPoolFromLosers += deducted;

    updates[`users/${loser.uid}/coins`] = updatedCoins;
    updates[`roomPlayers/${roomCode}/${loser.uid}/coins`] = updatedCoins;

    payoutSummary[loser.uid] = {
      uid: loser.uid,
      name: loser.name,
      score: loser.score,
      delta: -deducted,
      previousCoins: loser.currentCoins,
      updatedCoins,
      outcome: 'loss',
    };

    const txId = `loss_${roomCode}_${loser.uid}`;
    updates[`coinTransactions/${txId}`] = {
      transactionId: txId,
      uid: loser.uid,
      type: 'match_loss',
      amount: -deducted,
      previousBalance: loser.currentCoins,
      updatedBalance: updatedCoins,
      roomId: roomCode,
      timestamp: now,
    };
  });

  // Divide losers' coins equally among first-place winner(s)
  const baseShare = Math.floor(totalPoolFromLosers / winners.length);
  const remainder = totalPoolFromLosers % winners.length;

  winners.forEach((winner, idx) => {
    const share = baseShare + (idx < remainder ? 1 : 0);
    const updatedCoins = winner.currentCoins + share;

    updates[`users/${winner.uid}/coins`] = updatedCoins;
    updates[`roomPlayers/${roomCode}/${winner.uid}/coins`] = updatedCoins;

    payoutSummary[winner.uid] = {
      uid: winner.uid,
      name: winner.name,
      score: winner.score,
      delta: share,
      previousCoins: winner.currentCoins,
      updatedCoins,
      outcome: winners.length > 1 ? 'shared_win' : 'win',
    };

    const txId = `win_${roomCode}_${winner.uid}`;
    updates[`coinTransactions/${txId}`] = {
      transactionId: txId,
      uid: winner.uid,
      type: winners.length > 1 ? 'shared_match_win' : 'match_win',
      amount: share,
      previousBalance: winner.currentCoins,
      updatedBalance: updatedCoins,
      roomId: roomCode,
      timestamp: now,
    };
  });

  updates[`rooms/${roomCode}/payoutDone`] = true;
  updates[`rooms/${roomCode}/payoutOutcome`] = winners.length > 1 ? 'shared_win' : 'win';
  updates[`rooms/${roomCode}/winnerUid`] = winners.length === 1 ? winners[0].uid : null;
  updates[`rooms/${roomCode}/payoutSummary`] = payoutSummary;

  await update(ref(db), updates);
};