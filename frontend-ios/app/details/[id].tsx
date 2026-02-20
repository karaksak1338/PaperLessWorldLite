import { View, Text, ScrollView, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { StorageService, Document } from '../../services/StorageService';
import { Trash2, Save, Bell } from 'lucide-react-native';
import { supabase } from '../../services/supabaseClient';
import { ReminderService } from '../../services/ReminderService';

export default function DetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [doc, setDoc] = useState<Document | null>(null);
    const [signedUrl, setSignedUrl] = useState<string | null>(null);

    // Form state
    const [vendor, setVendor] = useState('');
    const [date, setDate] = useState('');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState('Other');
    const [reminderDate, setReminderDate] = useState('');
    const [documentTypes, setDocumentTypes] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        const fetchTypes = async () => {
            const { data } = await supabase.from('document_types').select('*').order('name');
            if (data) setDocumentTypes(data);
        };
        fetchTypes();

        if (id) {
            const fetchDoc = async () => {
                const document = await StorageService.getDocumentById(id as string);
                if (document) {
                    setDoc(document);
                    setVendor(document.vendor || '');
                    setDate(document.date || '');
                    setAmount(document.amount || '');
                    setType(document.type || 'Other');
                    setReminderDate(document.reminder_date || '');

                    // Fetch signed URL
                    if (document.image_uri) {
                        const url = await StorageService.getSignedUrl(document.image_uri);
                        setSignedUrl(url);
                    }
                }
            };
            fetchDoc();
        }
    }, [id]);

    const handleSave = async () => {
        if (!doc) return;

        try {
            // Sanitize amount: empty string should be null for PostgreSQL DECIMAL
            const sanitizedAmount = amount.trim() === '' ? null : amount.replace(/[^0-9.]/g, '');

            // Validate amount if present
            if (sanitizedAmount && isNaN(parseFloat(sanitizedAmount))) {
                Alert.alert("Invalid Amount", "Please enter a valid number for the amount.");
                return;
            }

            await StorageService.updateDocument(doc.id, {
                vendor: vendor.trim() || 'Unknown Vendor',
                date: date.trim() || null,
                amount: sanitizedAmount,
                type: type,
                reminder_date: reminderDate.trim() || null
            });

            // Schedule notification if reminder date is set
            if (reminderDate.trim()) {
                await ReminderService.scheduleDocumentReminder(doc.id, vendor.trim() || 'Document', reminderDate.trim());
            }

            Alert.alert("Success", "Changes saved successfully.");
            router.back();
        } catch (error: any) {
            console.error('Save failed:', error);
            Alert.alert("Error", `Failed to save changes: ${error.message || 'Unknown error'}`);
        }
    };

    const handleDelete = () => {
        if (!doc) return;
        Alert.alert(
            "Delete Document",
            "Are you sure you want to delete this document?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await StorageService.deleteDocument(doc.id, doc.image_uri);
                            router.replace('/');
                        } catch (error: any) {
                            Alert.alert("Error", "Failed to delete document.");
                        }
                    }
                }
            ]
        );
    };

    if (!doc) {
        return <View className="flex-1 bg-white" />;
    }

    return (
        <ScrollView className="flex-1 bg-white">
            <Stack.Screen options={{
                title: 'Edit Details',
                headerRight: () => (
                    <TouchableOpacity onPress={handleDelete} className="mr-2">
                        {/* @ts-ignore */}
                        <Trash2 size={24} color="#ef4444" />
                    </TouchableOpacity>
                )
            }} />

            <View className="p-4">
                {/* Image Preview */}
                <View className="w-full h-64 bg-zinc-100 rounded-lg mb-6 overflow-hidden border border-zinc-200">
                    {signedUrl ? (
                        <Image
                            source={{ uri: signedUrl }}
                            className="w-full h-full"
                            resizeMode="contain"
                        />
                    ) : (
                        <View className="flex-1 items-center justify-center">
                            <Text className="text-zinc-400">Loading image...</Text>
                        </View>
                    )}
                </View>

                {/* Form Fields */}
                <View className="mb-4">
                    <Text className="text-zinc-500 text-sm mb-1 uppercase font-semibold tracking-wider">Vendor</Text>
                    <TextInput
                        className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-base text-zinc-900"
                        value={vendor}
                        onChangeText={setVendor}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-zinc-500 text-sm mb-1 uppercase font-semibold tracking-wider">Date</Text>
                    <TextInput
                        className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-base text-zinc-900"
                        value={date}
                        onChangeText={setDate}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-zinc-500 text-sm mb-1 uppercase font-semibold tracking-wider">Total Amount</Text>
                    <TextInput
                        className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-base text-zinc-900"
                        value={amount}
                        onChangeText={setAmount}
                    />
                </View>

                <View className="mb-4">
                    <View className="flex-row items-center mb-1">
                        <Text className="text-zinc-500 text-sm uppercase font-semibold tracking-wider">Reminder Date</Text>
                        {/* @ts-ignore */}
                        <Bell size={14} color="#71717a" className="ml-2" />
                    </View>
                    <TextInput
                        className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-base text-zinc-900"
                        placeholder="YYYY-MM-DD"
                        value={reminderDate}
                        onChangeText={setReminderDate}
                    />
                    <Text className="text-zinc-400 text-xs mt-1">Leave empty to disable reminders.</Text>
                </View>

                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm mb-2 uppercase font-semibold tracking-wider">Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        <TouchableOpacity
                            onPress={() => setType('Other')}
                            className={`px-4 py-2 rounded-full mr-2 border ${type === 'Other' ? 'bg-zinc-800 border-zinc-800' : 'bg-white border-zinc-200'}`}
                        >
                            <Text className={`${type === 'Other' ? 'text-white' : 'text-zinc-600'} font-medium`}>Other</Text>
                        </TouchableOpacity>
                        {documentTypes.map((t) => (
                            <TouchableOpacity
                                key={t.id}
                                onPress={() => setType(t.name)}
                                className={`px-4 py-2 rounded-full mr-2 border ${type === t.name ? 'bg-blue-600 border-blue-600' : 'bg-white border-zinc-200'}`}
                            >
                                <Text className={`${type === t.name ? 'text-white' : 'text-zinc-600'} font-medium`}>{t.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <TouchableOpacity
                    className="bg-blue-600 p-4 rounded-xl flex-row items-center justify-center shadow-sm mb-4"
                    onPress={handleSave}
                >
                    {/* @ts-ignore */}
                    <Save size={20} color="white" className="mr-2" />
                    <Text className="text-white font-bold text-lg ml-2">Save Changes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="border border-red-200 bg-red-50 p-4 rounded-xl flex-row items-center justify-center shadow-sm"
                    onPress={handleDelete}
                >
                    {/* @ts-ignore */}
                    <Trash2 size={20} color="#ef4444" className="mr-2" />
                    <Text className="text-red-600 font-bold text-lg ml-2">Delete Document</Text>
                </TouchableOpacity>

            </View>
        </ScrollView>
    );
}
