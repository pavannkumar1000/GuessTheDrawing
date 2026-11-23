// app/index.js
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import {
  registerWithUsername,
  loginWithUsername,
  signOutUser,
  updateUsername,
} from '../services/authService';
import { COLORS } from '../utils/constants';

export default function HomeScreen() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  // Auth form state
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Legacy/fallback name prompt state
  const [inputName, setInputName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Game rules modal state
  const [rulesVisible, setRulesVisible] = useState(false);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Not signed in -> Show Username/Password Login or Registration
  if (!user) {
    const handleAuthSubmit = async () => {
      try {
        setSubmitting(true);
        if (authMode === 'register') {
          await registerWithUsername({ name, username, password });
        } else {
          await loginWithUsername({ username, password });
        }
        setPassword('');
      } catch (err) {
        Alert.alert(
          authMode === 'register' ? 'Sign Up Failed' : 'Login Failed',
          err?.message || 'Please check your details and try again.'
        );
      } finally {
        setSubmitting(false);
      }
    };

    const toggleMode = () => {
      setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
      setPassword('');
    };

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              <Text style={styles.title}>Guess The Drawing</Text>
              <Text style={styles.subtitle}>
                {authMode === 'register'
                  ? 'Create a permanent account to play'
                  : 'Sign in with your username and password'}
              </Text>

              {authMode === 'register' && (
                <TextInput
                  style={styles.input}
                  placeholder="Display Name (e.g. Alex)"
                  value={name}
                  onChangeText={setName}
                  maxLength={30}
                  autoCapitalize="words"
                />
              )}

              <TextInput
                style={styles.input}
                placeholder="Unique Username (e.g. alex_99)"
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase())}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Password (min. 6 characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleAuthSubmit}
              />

              <TouchableOpacity
                style={styles.button}
                onPress={handleAuthSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buttonText}>
                    {authMode === 'register' ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchModeBtn}
                onPress={toggleMode}
                disabled={submitting}
              >
                <Text style={styles.switchModeText}>
                  {authMode === 'register'
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Create One"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Fallback if signed-in user does not have a display name set yet
  if (!profile.isNameSet) {
    const handleSaveName = async () => {
      if (!inputName.trim() || inputName.trim().length < 3) {
        return Alert.alert('Invalid Name', 'Please enter at least 3 characters.');
      }
      try {
        setSavingName(true);
        await updateUsername(user.uid, inputName);
      } catch (err) {
        Alert.alert('Error', 'Could not save name. Try again.');
        setSavingName(false);
      }
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome!</Text>
          <Text style={styles.subtitle}>What should we call you?</Text>

          <TextInput
            style={styles.nameInput}
            placeholder="Enter display name"
            value={inputName}
            onChangeText={setInputName}
            maxLength={15}
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleSaveName}
            disabled={savingName}
          >
            {savingName ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Save & Play</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      Alert.alert('Sign Out Error', 'Could not sign out. Please try again.');
    }
  };

  // Normal Home Screen
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Guess The Drawing</Text>

        <Text style={styles.playerName}>Hello, {profile.name}!</Text>
        {profile.username ? (
          <Text style={styles.usernameHandle}>@{profile.username}</Text>
        ) : null}

        <View style={styles.coinContainer}>
          <Text style={styles.coinText}>🪙 Coins: {profile.coins ?? 0}</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/create-room')}
        >
          <Text style={styles.buttonText}>Create Room</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonOutline}
          onPress={() => router.push('/join-room')}
        >
          <Text style={styles.buttonOutlineText}>Join Room</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rulesButton}
          onPress={() => setRulesVisible(true)}
        >
          <Text style={styles.rulesButtonText}>📜 Game Rules</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={rulesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRulesVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📜 Game Rules</Text>
            <ScrollView style={styles.rulesScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.ruleItem}>
                • <Text style={styles.ruleBold}>Players (2 to 8):</Text> A game is not only for 2
                players. From 2 up to 8 players can play together in one room.
              </Text>
              <Text style={styles.ruleItem}>
                • <Text style={styles.ruleBold}>Drawing & Guessing:</Text> Each player gets a turn
                to draw the secret word in 60 seconds while other players type their guesses.
              </Text>
              <Text style={styles.ruleItem}>
                • <Text style={styles.ruleBold}>Points:</Text> You get +100 points for a right
                guess, and the drawer gets +50 points when someone guesses right.
              </Text>
              <Text style={styles.ruleItem}>
                • <Text style={styles.ruleBold}>Rounds:</Text> Everyone takes turns across the
                selected number of rounds until the game ends.
              </Text>
              <Text style={styles.ruleItem}>
                • <Text style={styles.ruleBold}>Coins (Coin Mode):</Text> Players who do not finish
                1st lose their entry coin (1 coin). The 1st-place player gets their coin plus all
                losing coins. If 2 or more players tie for 1st, they split the losing coins
                equally. If everyone ties for 1st, nobody loses or gains coins.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.closeRulesBtn}
              onPress={() => setRulesVisible(false)}
            >
              <Text style={styles.buttonText}>Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.dark,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.white,
    width: '100%',
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 14,
  },
  playerName: {
    fontSize: 18,
    color: COLORS.dark,
    marginBottom: 4,
    fontWeight: '600',
  },
  usernameHandle: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 20,
  },
  coinContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 32,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  coinText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  nameInput: {
    backgroundColor: COLORS.white,
    width: '100%',
    padding: 15,
    borderRadius: 12,
    fontSize: 18,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    width: '100%',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    width: '100%',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 15,
  },
  buttonOutlineText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  rulesButton: {
    backgroundColor: COLORS.white,
    width: '100%',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.gray,
  },
  rulesButtonText: {
    color: COLORS.dark,
    fontSize: 16,
    fontWeight: '700',
  },
  switchModeBtn: {
    marginTop: 6,
    paddingVertical: 8,
  },
  switchModeText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  signOutBtn: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  signOutText: {
    color: COLORS.gray,
    fontSize: 15,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 14,
  },
  rulesScroll: {
    marginBottom: 16,
  },
  ruleItem: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.dark,
    marginBottom: 12,
  },
  ruleBold: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  closeRulesBtn: {
    backgroundColor: COLORS.primary,
    width: '100%',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 0,
  },
});