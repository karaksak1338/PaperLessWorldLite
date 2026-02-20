"use client";

import { useState } from 'react';
import { AuthService } from '@/lib/auth';
import styles from '../../login/login.module.css';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            await AuthService.updatePassword(password);
            setMessage('Password updated successfully! You can now Sign In.');
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        } catch (error: any) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className="gradient-bg" />
            <div className={`${styles.card} glass`}>
                <h1 className={styles.title}>Update Password</h1>
                <p className={styles.subtitle}>Enter your new password below</p>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <input
                        type="password"
                        placeholder="New Password"
                        className={styles.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                    />
                    <button type="submit" className={styles.button} disabled={loading}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </form>

                {message && <p className={styles.message}>{message}</p>}
            </div>
        </div>
    );
}
