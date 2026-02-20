import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { AuthService } from '../services/AuthService';
import { User, LogOut, Shield, CreditCard } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState<any>(null);
    const [subscription, setSubscription] = useState<any>(null);
    const [monthlyUsage, setMonthlyUsage] = useState(0);

    const [fullName, setFullName] = useState('');
    const [address, setAddress] = useState('');

    useEffect(() => {
        fetchProfileData();
    }, []);

    const fetchProfileData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Fetch Profile
            let { data: profileData } = await supabase
                .from("profiles")
                .select("*, subscription_plans(name, monthly_limit)")
                .eq("id", user.id)
                .single();

            if (profileData) {
                setProfile(profileData);
                setFullName(profileData.full_name || '');
                setAddress(profileData.address || '');
                setSubscription(profileData.subscription_plans);
            }

            // 2. Monthly Usage
            const { data: usageCount } = await supabase.rpc('get_monthly_usage', { target_user_id: user.id });
            setMonthlyUsage(usageCount || 0);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from("profiles")
                .update({
                    full_name: fullName,
                    address: address,
                    updated_at: new Date().toISOString()
                })
                .eq("id", user.id);

            if (error) throw error;
            Alert.alert('Success', 'Profile updated successfully');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await AuthService.signOut();
            router.replace('/login');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    const handlePasswordReset = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) return;
            await AuthService.resetPassword(user.email);
            Alert.alert('Success', 'Password reset instructions sent to your email.');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#6366f1" />
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-zinc-50">
            <View className="p-6">
                {/* Plan Info */}
                <View className="bg-white p-4 rounded-xl border border-zinc-200 mb-6 shadow-sm">
                    <View className="flex-row items-center mb-2">
                        {/* @ts-ignore */}
                        <CreditCard size={20} color="#6366f1" />
                        <Text className="text-zinc-900 font-bold text-lg ml-2">Subscription</Text>
                    </View>
                    <Text className="text-zinc-600 mb-1">Current Plan: <Text className="font-bold text-indigo-600">{subscription?.name || 'Free'}</Text></Text>
                    <Text className="text-zinc-500 text-sm">
                        Usage: {monthlyUsage} / {subscription?.monthly_limit === -1 ? '∞' : subscription?.monthly_limit} docs this month
                    </Text>
                </View>

                {/* Profile Form */}
                <View className="bg-white p-4 rounded-xl border border-zinc-200 mb-6 shadow-sm">
                    <View className="flex-row items-center mb-4">
                        {/* @ts-ignore */}
                        <User size={20} color="#6366f1" />
                        <Text className="text-zinc-900 font-bold text-lg ml-2">Personal Details</Text>
                    </View>

                    <Text className="text-zinc-500 text-xs font-bold uppercase mb-1 ml-1">Full Name</Text>
                    <TextInput
                        className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4 text-zinc-900"
                        placeholder="Your name"
                        value={fullName}
                        onChangeText={setFullName}
                    />

                    <Text className="text-zinc-500 text-xs font-bold uppercase mb-1 ml-1">Address</Text>
                    <TextInput
                        className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4 text-zinc-900"
                        placeholder="Mailing address"
                        multiline
                        numberOfLines={3}
                        value={address}
                        onChangeText={setAddress}
                    />

                    <TouchableOpacity
                        className="bg-indigo-600 p-4 rounded-lg items-center mt-2"
                        onPress={handleUpdateProfile}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-base">Update Profile</Text>}
                    </TouchableOpacity>
                </View>

                {/* Security */}
                <View className="bg-white p-4 rounded-xl border border-zinc-200 mb-6 shadow-sm">
                    <View className="flex-row items-center mb-2">
                        {/* @ts-ignore */}
                        <Shield size={20} color="#6366f1" />
                        <Text className="text-zinc-900 font-bold text-lg ml-2">Security</Text>
                    </View>
                    <Text className="text-zinc-500 text-sm mb-4">You can reset your password by receiving instructions via email.</Text>

                    <TouchableOpacity
                        className="border border-zinc-200 p-3 rounded-lg items-center"
                        onPress={handlePasswordReset}
                    >
                        <Text className="text-zinc-700 font-semibold">Send Password Reset Email</Text>
                    </TouchableOpacity>
                </View>

                {/* Sign Out */}
                <TouchableOpacity
                    className="bg-red-50 p-4 rounded-xl border border-red-100 flex-row justify-center items-center"
                    onPress={handleSignOut}
                >
                    {/* @ts-ignore */}
                    <LogOut size={20} color="#ef4444" />
                    <Text className="text-red-500 font-bold text-lg ml-2">Sign Out</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}
