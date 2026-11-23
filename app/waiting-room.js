// app/waiting-room.js
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ref, onValue } from 'firebase/database';
import { db } from '../services/firebase';
import useAuth from '../hooks/useAuth';
import { startGame } from '../services/roomService';
import { COLORS } from '../utils/constants';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WaitingRoomScreen() {
  const { code } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;

    const roomRef = ref(db, `rooms/${code}`);
    const unsubRoom = onValue(roomRef, (snap) => {
      if (snap.exists()) {
        const roomData = snap.val();
        setRoom(roomData);
        
        // When host starts, all players jump to game screen
        if (roomData.status === 'playing') {
          router.push(`/game?code=${code}`);
        }
      }
    });

    const playersRef = ref(db, `roomPlayers/${code}`);
    const unsubPlayers = onValue(playersRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const playerArray = Object.values(data);
        playerArray.sort((a, b) => {
          if (a.isHost) return -1;
          if (b.isHost) return 1;
          return a.joinedAt - b.joinedAt;
        });
        setPlayers(playerArray);
      } else {
        setPlayers([]);
      }
      setLoading(false);
    });

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [code]);

  if (loading || !room) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const isHost = profile?.uid === room.hostId;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Room Code</Text>
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.subtext}>Share this code with friends!</Text>
      </View>

      <View style={styles.settingsBox}>
        <Text style={styles.settingsText}>Mode: {room.settings.mode.toUpperCase()}</Text>
        <Text style={styles.settingsText}>Rounds: {room.settings.rounds}</Text>
        <Text style={styles.settingsText}>Players: {players.length} / {room.settings.maxPlayers}</Text>
      </View>

      <Text style={styles.sectionTitle}>Players Joined:</Text>
      
      <FlatList
        data={players}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <Text style={styles.playerName}>
              {item.name} {item.isHost && '👑'}
            </Text>
            {item.uid === profile?.uid && <Text style={styles.youTag}>(You)</Text>}
          </View>
        )}
        style={styles.list}
      />

      {isHost ? (
        <TouchableOpacity 
          style={styles.startButton} 
          onPress={async () => {
            if (players.length < 2) {
              return alert('Need at least 2 players to start.');
            }
            try {
              await startGame(code, players);
            } catch (err) {
              alert('Error starting game: ' + err.message);
            }
          }}
        >
          <Text style={styles.startButtonText}>Start Game</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.waitingBox}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.waitingText}>Waiting for host to start...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  label: { fontSize: 16, color: COLORS.gray },
  code: { fontSize: 48, fontWeight: 'bold', color: COLORS.primary, letterSpacing: 5 },
  subtext: { fontSize: 14, color: COLORS.gray },
  settingsBox: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.white, padding: 15, borderRadius: 10, marginBottom: 20 },
  settingsText: { fontSize: 14, fontWeight: 'bold', color: COLORS.dark },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark, marginBottom: 10 },
  list: { flex: 1 },
  playerRow: { flexDirection: 'row', backgroundColor: COLORS.white, padding: 15, borderRadius: 10, marginBottom: 10, alignItems: 'center' },
  playerName: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  youTag: { color: COLORS.primary, marginLeft: 10, fontWeight: 'bold' },
  startButton: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 12, alignItems: 'center' },
  startButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  waitingBox: { alignItems: 'center', padding: 20 },
  waitingText: { color: COLORS.gray, marginTop: 10 },
});