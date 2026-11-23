// app/join-room.js
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import { joinRoom } from '../services/roomService';
import { COLORS } from '../utils/constants';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function JoinRoomScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleCodeChange = (text) => {
    const cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    setCode(cleaned);
  };

  const handleJoin = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length !== 4) {
      Alert.alert('Invalid Code', 'Please enter a 4-character room code.');
      return;
    }
    if (!profile) {
      Alert.alert('Please Wait', 'Profile still loading...');
      return;
    }

    try {
      setJoining(true);
      const validCode = await joinRoom(normalizedCode, profile);
      // Success! Go to waiting room
      router.push(`/waiting-room?code=${validCode}`);
    } catch (err) {
      Alert.alert('Unable to Join', err?.message || 'Room not found. Check the code.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Join a Room</Text>
        <Text style={styles.subtitle}>Enter the 4-letter code from your friend</Text>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={handleCodeChange}
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="XXXX"
          placeholderTextColor="#ccc"
          onSubmitEditing={handleJoin}
        />

        <TouchableOpacity style={styles.joinButton} onPress={handleJoin} disabled={joining}>
          {joining ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.joinButtonText}>Join Room</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 16, color: COLORS.gray, marginBottom: 30, textAlign: 'center' },
  codeInput: {
    backgroundColor: COLORS.white,
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.dark,
    textAlign: 'center',
    padding: 20,
    borderRadius: 12,
    letterSpacing: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 30,
  },
  joinButton: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 12, alignItems: 'center' },
  joinButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
});