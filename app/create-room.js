// app/create-room.js
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import { createRoom } from '../services/roomService';
import { COLORS, GAME_MODES } from '../utils/constants';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateRoomScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [rounds, setRounds] = useState(3);
  const [mode, setMode] = useState(GAME_MODES.FREE);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!profile) return alert('Profile still loading...');

    try {
      setCreating(true);
      const roomCode = await createRoom(profile, { maxPlayers, rounds, mode });
      router.push(`/waiting-room?code=${roomCode}`);
    } catch (err) {
      alert('Failed to create room: ' + err.message);
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        
        {/* Max Players Selector */}
        <Text style={styles.label}>Max Players</Text>
        <View style={styles.selectorRow}>
          {[2, 3, 4, 5, 6, 7, 8].map(num => (
            <TouchableOpacity 
              key={num} 
              style={[styles.numBtn, maxPlayers === num && styles.numBtnActive]}
              onPress={() => setMaxPlayers(num)}
            >
              <Text style={maxPlayers === num ? styles.numTextActive : styles.numText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rounds Selector */}
        <Text style={styles.label}>Number of Rounds (Max 5)</Text>
        <Text style={styles.helperText}>1 Round = Every player draws 1 time.</Text>
        <View style={styles.selectorRow}>
          {[1, 2, 3, 4, 5].map(num => (
            <TouchableOpacity 
              key={num} 
              style={[styles.numBtn, rounds === num && styles.numBtnActive]}
              onPress={() => setRounds(num)}
            >
              <Text style={rounds === num ? styles.numTextActive : styles.numText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Game Mode Selector */}
        <Text style={styles.label}>Game Mode</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity 
            style={[styles.modeBtn, mode === GAME_MODES.FREE && styles.modeBtnActive]} 
            onPress={() => setMode(GAME_MODES.FREE)}>
            <Text style={mode === GAME_MODES.FREE ? styles.modeTextActive : styles.modeText}>Free Mode</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.modeBtn, mode === GAME_MODES.COIN && styles.modeBtnActive]} 
            onPress={() => setMode(GAME_MODES.COIN)}>
            <Text style={mode === GAME_MODES.COIN ? styles.modeTextActive : styles.modeText}>Coin Mode</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={creating}>
          {creating ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.createButtonText}>Create Room</Text>}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },
  label: { fontSize: 18, color: COLORS.dark, marginBottom: 5, marginTop: 20, fontWeight: 'bold' },
  helperText: { fontSize: 12, color: COLORS.gray, marginBottom: 10 },
  selectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#ddd' },
  numBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  numText: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  numTextActive: { fontSize: 18, fontWeight: 'bold', color: COLORS.white },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  modeBtn: { flex: 1, padding: 15, borderRadius: 10, borderWidth: 2, borderColor: COLORS.primary, marginHorizontal: 5, alignItems: 'center' },
  modeBtnActive: { backgroundColor: COLORS.primary },
  modeText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 16 },
  modeTextActive: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  createButton: { backgroundColor: COLORS.secondary, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 40 },
  createButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
});