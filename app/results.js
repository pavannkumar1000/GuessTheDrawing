// app/results.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ref, onValue } from 'firebase/database';
import { db } from '../services/firebase';
import useAuth from '../hooks/useAuth';
import { processCoinPayout } from '../services/roomService';
import { COLORS } from '../utils/constants';

function getNumericScore(player) {
  const num = Number(player?.score);
  return Number.isFinite(num) ? num : 0;
}

export default function ResultsScreen() {
  const { code } = useLocalSearchParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [players, setPlayers] = useState([]);
  const [room, setRoom] = useState(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  const payoutTriggeredForRoomRef = useRef(null);

  useEffect(() => {
    if (!code) {
      setRoomLoaded(true);
      setPlayersLoaded(true);
      return;
    }

    payoutTriggeredForRoomRef.current = null;
    setRoomLoaded(false);
    setPlayersLoaded(false);

    const roomRef = ref(db, `rooms/${code}`);
    const unsubRoom = onValue(roomRef, (snap) => {
      setRoom(snap.exists() ? snap.val() : null);
      setRoomLoaded(true);
    });

    const playersRef = ref(db, `roomPlayers/${code}`);
    const unsubPlayers = onValue(playersRef, (snap) => {
      if (snap.exists()) {
        const rawVal = snap.val();
        const pArray = Array.isArray(rawVal)
          ? rawVal.filter(Boolean)
          : Object.entries(rawVal || {}).map(([uid, val]) => ({
              uid: val?.uid || uid,
              ...val,
            }));
        setPlayers(pArray);
      } else {
        setPlayers([]);
      }
      setPlayersLoaded(true);
    });

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [code]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => getNumericScore(b) - getNumericScore(a));
  }, [players]);

  const rankedPlayers = useMemo(() => {
    let prevScore = null;
    let prevRank = 1;

    return sortedPlayers.map((player, index) => {
      const score = getNumericScore(player);
      const rank = index > 0 && score === prevScore ? prevRank : index + 1;
      prevScore = score;
      prevRank = rank;
      return {
        ...player,
        score,
        rank,
      };
    });
  }, [sortedPlayers]);

  const { highestScore, topPlayers, winnerIds, isDraw } = useMemo(() => {
    if (rankedPlayers.length === 0) {
      return {
        highestScore: 0,
        topPlayers: [],
        winnerIds: new Set(),
        isDraw: false,
      };
    }

    const maxScore = rankedPlayers[0].score;
    const tiedTop = rankedPlayers.filter((p) => p.score === maxScore);
    const ids = new Set(tiedTop.map((p, idx) => p.uid || `${p.name || 'player'}-${idx}`));

    return {
      highestScore: maxScore,
      topPlayers: tiedTop,
      winnerIds: ids,
      isDraw: tiedTop.length > 1,
    };
  }, [rankedPlayers]);

  useEffect(() => {
    if (!code || room?.status !== 'ended' || sortedPlayers.length === 0) return;
    if (payoutTriggeredForRoomRef.current === code) return;

    payoutTriggeredForRoomRef.current = code;
    const primaryWinnerId = topPlayers[0]?.uid || sortedPlayers[0]?.uid || null;
    processCoinPayout(code, sortedPlayers, primaryWinnerId).catch((err) => {
      console.error('Error processing coin payout:', err);
    });
  }, [code, room?.status, sortedPlayers, topPlayers]);

  if (!roomLoaded || !playersLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.statusText}>Calculating results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!room || rankedPlayers.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>🏆 Game Over! 🏆</Text>
          <View style={styles.outcomeCard}>
            <Text style={styles.outcomeSubtitle}>
              No player scores available for this game.
            </Text>
          </View>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/')}>
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const soleWinner = !isDraw ? topPlayers[0] : null;
  const entryCost = Number(room?.settings?.entryCost) || 0;
  const isCoinMode = room?.settings?.mode === 'coin';
  const payoutSummary = room?.payoutSummary || {};
  const currentPlayerSummary = profile?.uid ? payoutSummary[profile.uid] : null;
  const loserCount = rankedPlayers.filter((p) => p.score < highestScore).length;
  const transferPool = loserCount * entryCost;
  const isAllDraw = isDraw && loserCount === 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.title}>🏆 Game Over! 🏆</Text>

          {isDraw ? (
            <View style={[styles.outcomeCard, styles.drawCard]}>
              <Text style={styles.trophyBadge}>🏆🤝🏆</Text>
              <Text style={styles.drawHeading}>
                {isAllDraw ? "It's a Draw!" : 'Tied for 1st!'}
              </Text>
              <Text style={styles.sharedMessage}>
                {isAllDraw
                  ? `Everyone tied at ${highestScore} pts! Coins stay with each player.`
                  : `Tied at the top with ${highestScore} pts! Equal coin share for:`}
              </Text>
              <View style={styles.tiedWinnersList}>
                {topPlayers.map((p, idx) => (
                  <View key={p.uid || `${p.name}-${idx}`} style={styles.tiedWinnerChip}>
                    <Text style={styles.tiedWinnerName}>{p.name || 'Player'}</Text>
                    <Text style={styles.tiedWinnerScore}>{p.score} pts</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.outcomeCard, styles.winnerCard]}>
              <Text style={styles.trophyBadge}>🏆</Text>
              <Text style={styles.winnerHeading}>Winner!</Text>
              <Text style={styles.soleWinnerName}>{soleWinner?.name || 'Player'}</Text>
              <Text style={styles.soleWinnerScore}>{soleWinner?.score ?? 0} pts</Text>
            </View>
          )}

          {isCoinMode && currentPlayerSummary && (
            <View style={styles.coinNoticeCard}>
              {currentPlayerSummary.delta < 0 ? (
                <Text style={styles.coinLossText}>
                  Your coins are gone! ({currentPlayerSummary.delta} 🪙) • Now you have{' '}
                  {currentPlayerSummary.updatedCoins} 🪙
                </Text>
              ) : currentPlayerSummary.delta > 0 ? (
                <Text style={styles.coinWinText}>
                  {isDraw
                    ? `Equal share! You got +${currentPlayerSummary.delta} 🪙 • Total: ${currentPlayerSummary.updatedCoins} 🪙`
                    : `You kept your coin + won +${currentPlayerSummary.delta} 🪙 • Total: ${currentPlayerSummary.updatedCoins} 🪙`}
                </Text>
              ) : (
                <Text style={styles.coinDrawText}>
                  Draw! Your coins stay with you (0 🪙) • Total: {currentPlayerSummary.updatedCoins} 🪙
                </Text>
              )}
            </View>
          )}

          {isCoinMode && (
            <View style={styles.coinPool}>
              <Text style={styles.coinPoolText}>
                🪙 {isAllDraw ? 'No Coin Transfer (Draw)' : `Losers Pool: ${transferPool}`}
              </Text>
            </View>
          )}

          <View style={styles.leaderboard}>
            <Text style={styles.leaderboardTitle}>Final Standings</Text>
            {rankedPlayers.map((p, index) => {
              const rowKey = p.uid || `${p.name || 'player'}-${index}`;
              const isWinnerRow = winnerIds.has(rowKey);
              const summary = payoutSummary[p.uid];
              const playerCoins =
                summary?.updatedCoins !== undefined ? summary.updatedCoins : (p.coins ?? 0);
              const delta = summary?.delta ?? 0;

              return (
                <View
                  key={rowKey}
                  style={[styles.playerRow, isWinnerRow && styles.winnerRow]}
                >
                  <Text style={[styles.rank, isWinnerRow && styles.winnerAccent]}>
                    #{p.rank}
                  </Text>
                  <View style={styles.nameWrapper}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name || 'Player'}
                    </Text>
                    {isWinnerRow && (
                      <Text style={styles.winnerTag}>
                        {isDraw ? 'Joint Winner' : 'Winner'}
                      </Text>
                    )}
                    {isCoinMode && (
                      <Text style={styles.playerCoinSub}>
                        🪙 {playerCoins} coins
                        {room?.payoutDone
                          ? delta > 0
                            ? ` (+${delta})`
                            : delta < 0
                            ? ` (${delta})`
                            : ' (0)'
                          : ''}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.score, isWinnerRow && styles.winnerAccent]}>
                    {p.score} pts
                  </Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/')}>
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.gray,
  },
  content: {
    padding: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  outcomeCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  winnerCard: {
    borderColor: COLORS.secondary,
  },
  drawCard: {
    borderColor: COLORS.primary,
  },
  trophyBadge: {
    fontSize: 36,
    marginBottom: 6,
  },
  winnerHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.secondary,
    marginBottom: 4,
  },
  soleWinnerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.dark,
    textAlign: 'center',
  },
  soleWinnerScore: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  drawHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 6,
    textAlign: 'center',
  },
  sharedMessage: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 12,
  },
  outcomeSubtitle: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: 'center',
  },
  tiedWinnersList: {
    width: '100%',
    gap: 8,
  },
  tiedWinnerChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tiedWinnerName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  tiedWinnerScore: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  coinNoticeCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    alignItems: 'center',
  },
  coinLossText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
    textAlign: 'center',
  },
  coinWinText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.secondary,
    textAlign: 'center',
  },
  coinDrawText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
  },
  coinPool: {
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    marginBottom: 16,
  },
  coinPoolText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  leaderboard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 15,
    marginBottom: 24,
  },
  leaderboardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gray,
    marginBottom: 8,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderRadius: 8,
  },
  winnerRow: {
    backgroundColor: '#fff9e6',
    borderBottomColor: 'transparent',
    marginVertical: 2,
  },
  rank: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.gray,
    width: 38,
  },
  nameWrapper: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  winnerTag: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    marginTop: 2,
  },
  playerCoinSub: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
    marginTop: 2,
  },
  score: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  winnerAccent: {
    color: COLORS.secondary,
  },
  homeBtn: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  homeBtnText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
});