// app/game.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  PanResponder,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ref, onValue } from 'firebase/database';
import { db } from '../services/firebase';
import useAuth from '../hooks/useAuth';
import { saveStroke, subscribeToDrawings, clearCanvasDB } from '../services/drawingService';
import { submitGuess, nextTurn } from '../services/roomService';
import { COLORS } from '../utils/constants';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const VIRTUAL_CANVAS_SIZE = 1000;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function normalizePoint(locationX, locationY, width, height) {
  const safeWidth = width > 0 ? width : 1;
  const safeHeight = height > 0 ? height : 1;
  const nx = clamp((locationX / safeWidth) * VIRTUAL_CANVAS_SIZE, 0, VIRTUAL_CANVAS_SIZE);
  const ny = clamp((locationY / safeHeight) * VIRTUAL_CANVAS_SIZE, 0, VIRTUAL_CANVAS_SIZE);
  return {
    x: Math.round(nx * 100) / 100,
    y: Math.round(ny * 100) / 100,
  };
}

function scaleStrokeWidth(width, canvasWidth, canvasHeight) {
  const baseWidth = Number(width) || 5;
  const minDim = Math.min(canvasWidth || 360, canvasHeight || 360);
  const ratio = VIRTUAL_CANVAS_SIZE / Math.max(minDim, 1);
  return Math.max(2, Math.round(baseWidth * ratio * 10) / 10);
}

export default function GameScreen() {
  const { code } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const currentUserId = profile?.uid || profile?.id || null;

  const codeRef = useRef(code);
  const isDrawerRef = useRef(false);
  const currentPathRef = useRef('');
  const brushColorRef = useRef('#000000');
  const brushSizeRef = useRef(5);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const timerRef = useRef(null);
  const scrollViewRef = useRef(null);
  const lastClearedDrawerRef = useRef(null);

  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [guess, setGuess] = useState('');

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    const computedDrawer = Boolean(
      room?.currentDrawerId && currentUserId && room.currentDrawerId === currentUserId
    );
    isDrawerRef.current = computedDrawer;
  }, [room?.currentDrawerId, currentUserId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 1. Listen to Room Data
  useEffect(() => {
    if (!code) return;
    const roomRef = ref(db, `rooms/${code}`);
    const unsub = onValue(roomRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setRoom(data);
        if (data.currentDrawerId && currentUserId) {
          isDrawerRef.current = data.currentDrawerId === currentUserId;
        }

        if (data.status === 'ended') {
          router.replace(`/results?code=${code}`);
        }
      }
    });
    return () => unsub();
  }, [code, currentUserId, router]);

  // 2. Listen to Players (auto-advance when all guessers guess right, for 2-8 players)
  useEffect(() => {
    if (!code) return;
    const playersRef = ref(db, `roomPlayers/${code}`);
    const unsub = onValue(playersRef, (snap) => {
      if (snap.exists()) {
        const pArray = Object.values(snap.val());
        setPlayers(pArray);

        if (room && room.status === 'playing' && isDrawerRef.current) {
          const guessers = pArray.filter((p) => p.uid !== room.currentDrawerId);
          const allGuessed = guessers.length > 0 && guessers.every((p) => p.hasGuessedCorrectly);

          if (allGuessed) {
            nextTurn(code);
          }
        }
      }
    });
    return () => unsub();
  }, [code, room]);

  // 3. Listen to Drawings
  useEffect(() => {
    if (!code) return;
    const unsub = subscribeToDrawings(code, (strokes) => {
      setPaths(Array.isArray(strokes) ? strokes : []);
    });
    return () => unsub();
  }, [code]);

  // 4. Timer Logic
  useEffect(() => {
    if (room?.status !== 'playing') return;

    setTimeLeft(room.timeLimit || 60);
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (isDrawerRef.current) nextTurn(code);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [room?.currentDrawerId, room?.status, code]);

  // 5. CLEAR CANVAS ONCE WHEN DRAWER CHANGES
  useEffect(() => {
    if (room?.currentDrawerId && code && lastClearedDrawerRef.current !== room.currentDrawerId) {
      lastClearedDrawerRef.current = room.currentDrawerId;
      currentPathRef.current = '';
      setCurrentPath('');
      clearCanvasDB(code);
    }
  }, [room?.currentDrawerId, code]);

  useEffect(() => {
    brushColorRef.current = brushColor;
  }, [brushColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  const handleCanvasLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      const nextSize = { width, height };
      canvasSizeRef.current = nextSize;
      setCanvasSize(nextSize);
    }
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDrawerRef.current,
      onMoveShouldSetPanResponder: () => isDrawerRef.current,
      onPanResponderGrant: (evt) => {
        if (!isDrawerRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const { width, height } = canvasSizeRef.current;
        const { x, y } = normalizePoint(locationX, locationY, width, height);
        currentPathRef.current = `M ${x} ${y}`;
        setCurrentPath(currentPathRef.current);
      },
      onPanResponderMove: (evt) => {
        if (!isDrawerRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const { width, height } = canvasSizeRef.current;
        const { x, y } = normalizePoint(locationX, locationY, width, height);
        currentPathRef.current += ` L ${x} ${y}`;
        setCurrentPath(currentPathRef.current);
      },
      onPanResponderRelease: () => {
        if (!isDrawerRef.current) return;
        const activeCode = codeRef.current;
        if (currentPathRef.current && activeCode) {
          const { width, height } = canvasSizeRef.current;
          const normalizedWidth = scaleStrokeWidth(brushSizeRef.current, width, height);
          const newStroke = {
            path: currentPathRef.current,
            color: brushColorRef.current,
            width: normalizedWidth,
            coordSpace: VIRTUAL_CANVAS_SIZE,
          };
          saveStroke(activeCode, newStroke);
          currentPathRef.current = '';
          setCurrentPath('');
        }
      },
      onPanResponderTerminate: () => {
        if (!isDrawerRef.current) return;
        const activeCode = codeRef.current;
        if (currentPathRef.current && activeCode) {
          const { width, height } = canvasSizeRef.current;
          const normalizedWidth = scaleStrokeWidth(brushSizeRef.current, width, height);
          const newStroke = {
            path: currentPathRef.current,
            color: brushColorRef.current,
            width: normalizedWidth,
            coordSpace: VIRTUAL_CANVAS_SIZE,
          };
          saveStroke(activeCode, newStroke);
        }
        currentPathRef.current = '';
        setCurrentPath('');
      },
    })
  ).current;

  const handleGuessSubmit = async () => {
    if (!guess.trim()) return;
    const myData = players.find((p) => p.uid === currentUserId);

    const result = await submitGuess(
      code,
      currentUserId,
      room.currentDrawerId,
      guess,
      room.currentWord,
      myData?.hasGuessedCorrectly
    );
    if (result.success) setGuess('');
    else if (result.message !== 'Already guessed!') {
      Alert.alert('❌ Wrong');
      setGuess('');
    }
  };

  const handleSkip = () => {
    nextTurn(code);
  };

  if (!room) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const isDrawer = Boolean(
    room.currentDrawerId && currentUserId && room.currentDrawerId === currentUserId
  );
  const drawWord = room.currentWord || room.word || '...';
  const me = players.find((p) => p.uid === currentUserId);
  const hasGuessed = me?.hasGuessedCorrectly;
  const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const activeStrokeWidth = scaleStrokeWidth(brushSize, canvasSize.width, canvasSize.height);
  const keyboardVerticalOffset = Platform.OS === 'ios' ? insets.top : insets.top + insets.bottom;

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerText}>
              Round {room.currentRound}/{room.settings?.rounds ?? 1}
            </Text>
            <Text style={styles.timerText}>⏱ {timeLeft}s</Text>
            {isDrawer ? (
              <Text style={styles.wordText} numberOfLines={1}>
                Draw: {drawWord}
              </Text>
            ) : (
              <Text style={styles.wordText} numberOfLines={1}>
                Guess the drawing!
              </Text>
            )}
          </View>

          <View style={styles.scoreboard}>
            {sortedPlayers.map((p) => (
              <View key={p.uid} style={styles.scoreItem}>
                <Text style={styles.scoreName}>{p.name}</Text>
                <Text style={styles.scorePoints}>{p.score || 0} pts</Text>
              </View>
            ))}
          </View>

          {/* CANVAS */}
          <View
            style={styles.canvasContainer}
            onLayout={handleCanvasLayout}
            {...panResponder.panHandlers}
          >
            <Svg
              style={StyleSheet.absoluteFill}
              viewBox={`0 0 ${VIRTUAL_CANVAS_SIZE} ${VIRTUAL_CANVAS_SIZE}`}
              preserveAspectRatio="none"
            >
              {paths.map((p, index) => (
                <Path
                  key={p.id || index}
                  d={p.path}
                  stroke={p.color}
                  strokeWidth={p.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentPath ? (
                <Path
                  d={currentPath}
                  stroke={brushColor}
                  strokeWidth={activeStrokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </View>

          {isDrawer ? (
            <View style={styles.toolsContainer}>
              <View style={styles.colorsRow}>
                {['#000000', '#FF0000', '#0000FF', '#008000', '#FFA500'].map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorBtn,
                      { backgroundColor: c },
                      brushColor === c && styles.colorBtnActive,
                    ]}
                    onPress={() => setBrushColor(c)}
                  />
                ))}
              </View>
              <View style={styles.sizesRow}>
                {[3, 6, 12].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sizeBtn, brushSize === s && styles.sizeBtnActive]}
                    onPress={() => setBrushSize(s)}
                  >
                    <Text style={styles.sizeText}>{s === 3 ? 'S' : s === 6 ? 'M' : 'L'}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.clearBtn} onPress={() => clearCanvasDB(code)}>
                  <Text style={styles.clearText}>Clear 🗑️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                  <Text style={styles.clearText}>Skip ⏭</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* GUESSER INPUT (Native Keyboard) */
            <View style={styles.guessContainer}>
              {hasGuessed ? (
                <Text style={styles.successText}>🎉 You guessed it! Waiting for others...</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.guessInput}
                    placeholder="Type guess..."
                    value={guess}
                    onChangeText={setGuess}
                    autoCapitalize="none"
                    onFocus={() => {
                      requestAnimationFrame(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      });
                    }}
                    onSubmitEditing={handleGuessSubmit}
                  />
                  <TouchableOpacity style={styles.guessBtn} onPress={handleGuessSubmit}>
                    <Text style={styles.guessBtnText}>Send</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: COLORS.white,
    gap: 6,
  },
  headerText: { fontSize: 14, fontWeight: 'bold', color: COLORS.gray },
  timerText: { fontSize: 18, fontWeight: 'bold', color: COLORS.error },
  wordText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    flexShrink: 1,
    textAlign: 'right',
  },

  scoreboard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    backgroundColor: '#e0e0e0',
    padding: 5,
  },
  scoreItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    margin: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  scoreName: { fontSize: 12, fontWeight: 'bold', marginRight: 5, color: COLORS.dark },
  scorePoints: { fontSize: 12, color: COLORS.primary, fontWeight: 'bold' },

  canvasContainer: {
    flex: 1,
    minHeight: 250,
    backgroundColor: COLORS.white,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },

  toolsContainer: {
    padding: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  colorsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  colorBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorBtnActive: { borderColor: COLORS.primary },
  sizesRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  sizeBtn: {
    width: 40,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeBtnActive: { backgroundColor: COLORS.primary },
  sizeText: { fontWeight: 'bold', color: COLORS.dark },
  clearBtn: { backgroundColor: COLORS.error, padding: 8, borderRadius: 8 },
  skipBtn: { backgroundColor: COLORS.secondary, padding: 8, borderRadius: 8 },
  clearText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },

  guessContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    alignItems: 'center',
  },
  guessInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    height: 45,
  },
  guessBtn: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 8,
    height: 45,
    marginLeft: 10,
  },
  guessBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  successText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.success,
    textAlign: 'center',
    padding: 20,
    flex: 1,
  },
});