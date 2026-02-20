import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session } from '@supabase/supabase-js';

export default function Layout() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
    }, []);

    useEffect(() => {
        if (loading) return;

        const inAuthGroup = segments[0] === 'login';

        if (!session && !inAuthGroup) {
            // Redirect to the login page if not authenticated
            router.replace('/login');
        } else if (session && inAuthGroup) {
            // Redirect away from login if authenticated
            router.replace('/');
        }
    }, [session, loading, segments]);

    return (
        <SafeAreaProvider>
            <Stack
                screenOptions={{
                    headerStyle: {
                        backgroundColor: '#f4f4f5',
                    },
                    headerShadowVisible: false,
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                    contentStyle: {
                        backgroundColor: '#ffffff',
                    },
                }}
            >
                <Stack.Screen name="index" options={{ title: 'PaperLessWorldLite' }} />
                <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
                <Stack.Screen name="profile" options={{ title: 'My Account' }} />
                <Stack.Screen name="scan" options={{ title: 'Scan Document', presentation: 'modal' }} />
                <Stack.Screen name="details/[id]" options={{ title: 'Document Details' }} />
            </Stack>
        </SafeAreaProvider>
    );
}
