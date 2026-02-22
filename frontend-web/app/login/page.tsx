"use client";

import { useState } from 'react';
import { AuthService } from '@/lib/auth';
import styles from './login.module.css';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'signin' | 'signup' | 'forgot'>('signin');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            if (view === 'signup') {
                await AuthService.signUp(email, password);
                setMessage('Account created! Please check your email if confirmation is enabled, otherwise you can now Sign In.');
                setView('signin');
            } else if (view === 'signin') {
                await AuthService.signIn(email, password);
                window.location.href = '/';
            } else if (view === 'forgot') {
                await AuthService.resetPassword(email);
                setMessage('Password reset link sent to your email!');
            }
        } catch (error: any) {
            console.error('Auth error:', error);
            const errMsg = error.message || '';

            if (errMsg.includes('User already registered') && view === 'signup') {
                setMessage('Email already registered. Switching to Sign In.');
                setView('signin');
            } else if (errMsg.includes('rate limit exceeded')) {
                setMessage('Security Limit: Too many requests. Please wait a few minutes or contact support for higher limits.');
            } else if (errMsg.includes('Network request failed')) {
                setMessage('Connection Error: Please check your internet or firewall settings.');
            } else {
                setMessage(error.message || 'An unexpected error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className="gradient-bg" />
            <div className={`${styles.card} glass`}>
                <h1 className={styles.title}>
                    {view === 'signin' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Reset Password'}
                </h1>
                <p className={styles.subtitle}>
                    {view === 'signin' ? 'Welcome back to PaperLessWorld' :
                        view === 'signup' ? 'Join PaperLessWorld today' :
                            'Enter your email to receive a reset link'}
                </p>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <input
                        type="email"
                        placeholder="Email address"
                        className={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                    {view !== 'forgot' && (
                        <input
                            type="password"
                            placeholder="Password"
                            className={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                    )}
                    <button type="submit" className={styles.button} disabled={loading}>
                        {loading ? 'Processing...' :
                            (view === 'signin' ? 'Sign In' : view === 'signup' ? 'Sign Up' : 'Send Reset Link')}
                    </button>
                </form>

                <div className={styles.authActions}>
                    {view === 'signin' ? (
                        <>
                            <button onClick={() => setView('signup')} className={styles.toggleButton} disabled={loading}>
                                Don't have an account? Sign Up
                            </button>
                            <button onClick={() => setView('forgot')} className={styles.toggleButton} disabled={loading}>
                                Forgot Password?
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setView('signin')} className={styles.toggleButton} disabled={loading}>
                            Back to Sign In
                        </button>
                    )}
                </div>

                {message && (
                    <p className={`${styles.message} ${message.includes('error') || message.includes('failed') ? styles.error : ''}`}>
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
}
