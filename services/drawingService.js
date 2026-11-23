// services/drawingService.js
import { ref, push, set, onValue, remove } from 'firebase/database';
import { db } from './firebase';

const VIRTUAL_CANVAS_SIZE = 1000;

function isValidStroke(stroke) {
  return (
    stroke &&
    typeof stroke.path === 'string' &&
    stroke.path.trim().length > 0 &&
    typeof stroke.color === 'string' &&
    stroke.color.length > 0 &&
    typeof stroke.width === 'number' &&
    !Number.isNaN(stroke.width) &&
    stroke.width > 0 &&
    stroke.coordSpace === VIRTUAL_CANVAS_SIZE
  );
}

// Save a completed normalized stroke to Firebase
export const saveStroke = async (roomCode, strokeData) => {
  if (!roomCode || !isValidStroke(strokeData)) return;
  try {
    const strokesRef = ref(db, `drawings/${roomCode}`);
    const newStrokeRef = push(strokesRef);
    await set(newStrokeRef, {
      path: strokeData.path,
      color: strokeData.color,
      width: strokeData.width,
      coordSpace: VIRTUAL_CANVAS_SIZE,
    });
  } catch (error) {
    console.error('Error saving stroke:', error);
  }
};

// Listen to live strokes
export const subscribeToDrawings = (roomCode, callback) => {
  if (!roomCode) {
    callback([]);
    return () => {};
  }
  const strokesRef = ref(db, `drawings/${roomCode}`);
  const unsubscribe = onValue(strokesRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const strokesArray = Object.values(data).filter(isValidStroke);
      callback(strokesArray);
    } else {
      callback([]);
    }
  });
  return unsubscribe;
};

// Clear the canvas in Firebase
export const clearCanvasDB = async (roomCode) => {
  if (!roomCode) return;
  try {
    const strokesRef = ref(db, `drawings/${roomCode}`);
    await remove(strokesRef);
  } catch (error) {
    console.error('Error clearing canvas:', error);
  }
};