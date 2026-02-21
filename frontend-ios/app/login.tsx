"use client";

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { AuthService } from '../services/AuthService';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [message, setMessage] = useState('');
    const router = useRouter();

    const handleSubmit = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            if (isSignUp) {
                await AuthService.signUp(email, password);
                Alert.alert('Success', 'Account created! You can now sign in.');
                setIsSignUp(false);
            } else {
                await AuthService.signIn(email, password);
                // The _layout effect will handle redirection based on session state
            }
        } catch (error: any) {
            console.error(error);
            Alert.alert('Auth Error', error.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            Alert.alert('Email Required', 'Please enter your email address first to reset your password.');
            return;
        }

        setLoading(true);
        try {
            await AuthService.resetPassword(email);
            Alert.alert('Success', 'Password reset instructions have been sent to your email.');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to send reset email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View className="flex-1 justify-center px-6">
                    <View style={styles.header}>
                        <Text style={styles.title}>{isSignUp ? 'Join' : 'Welcome to'}</Text>
                        <Text style={styles.brand}>DocuVault Pro</Text>
                        <Text style={styles.subtitle}>
                            {isSignUp ? 'Create an account to start syncing' : 'Enter your credentials to access your vault'}
                        </Text>
                    </View>

                    <View style={styles.form}>
                        <TextInput
                            style={styles.input}
                            placeholder="Email address"
                            placeholderTextColor="#9ca3af"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoComplete="email"
                            editable={!loading}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#9ca3af"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            editable={!loading}
                        />

                        <TouchableOpacity
                            style={[styles.button, loading && styles.buttonDisabled]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.buttonText}>
                                    {isSignUp ? 'Sign Up' : 'Sign In'}
                                </Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setIsSignUp(!isSignUp)}
                            className="mt-4 items-center"
                            disabled={loading}
                        >
                            <Text className="text-zinc-500 underline">
                                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                            </Text>
                        </TouchableOpacity>

                        {!isSignUp && (
                            <TouchableOpacity
                                onPress={handleForgotPassword}
                                className="mt-4 items-center"
                                disabled={loading}
                            >
                                <Text className="text-zinc-400 text-sm">Forgot Password?</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    scrollContent: {
        flexGrow: 1,
    },
    header: {
        marginTop: 80,
        marginBottom: 30,
    },
    title: {
        fontSize: 24,
        color: '#3f3f46',
    },
    brand: {
        fontSize: 32,
        fontWeight: '900',
        color: '#6366f1',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 16,
        color: '#71717a',
        lineHeight: 24,
    },
    form: {
        gap: 16,
    },
    input: {
        backgroundColor: '#f4f4f5',
        padding: 16,
        borderRadius: 12,
        fontSize: 16,
        color: '#18181b',
        borderWidth: 1,
        borderColor: '#e4e4e7',
    },
    button: {
        backgroundColor: '#6366f1',
        padding: 18,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        minHeight: 56,
        justifyContent: 'center'
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    }
});
