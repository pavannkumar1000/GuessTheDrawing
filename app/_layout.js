// app/_layout.js
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../utils/constants';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create-room" options={{ title: 'Create Room' }} />
        <Stack.Screen name="join-room" options={{ title: 'Join Room' }} />
        <Stack.Screen name="waiting-room" options={{ title: 'Waiting Room', headerBackVisible: false }} />
        <Stack.Screen name="game" options={{ title: 'Playing...', headerBackVisible: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}