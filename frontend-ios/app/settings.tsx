import { View, Text, TouchableOpacity, TextInput, FlatList, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Trash2, Plus } from 'lucide-react-native';

export default function SettingsScreen() {
    const [types, setTypes] = useState<{ id: string, name: string }[]>([]);
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchTypes = async () => {
        const { data, error } = await supabase
            .from('document_types')
            .select('*')
            .order('name');
        if (error) console.error(error);
        else setTypes(data || []);
    };

    useEffect(() => {
        fetchTypes();
    }, []);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        const { error } = await supabase
            .from('document_types')
            .insert([{ name: newName.trim() }]);

        if (error) {
            Alert.alert('Error', error.message);
        } else {
            setNewName('');
            fetchTypes();
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        Alert.alert(
            "Delete Type",
            "This will remove the label but keep your documents. Continue?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const { error } = await supabase
                            .from('document_types')
                            .delete()
                            .eq('id', id);
                        if (error) Alert.alert('Error', error.message);
                        else fetchTypes();
                    }
                }
            ]
        );
    };

    return (
        <View className="flex-1 bg-white p-4">
            <Stack.Screen options={{ title: 'Manage Content Labels' }} />

            <View className="mb-6">
                <Text className="text-zinc-500 text-xs font-bold uppercase mb-2">Add New Labels</Text>
                <View className="flex-row">
                    <TextInput
                        className="flex-1 bg-zinc-100 p-3 rounded-lg mr-2"
                        placeholder="e.g. Tax, Invoice, Personal..."
                        value={newName}
                        onChangeText={setNewName}
                    />
                    <TouchableOpacity
                        className="bg-blue-600 px-4 rounded-lg justify-center"
                        onPress={handleAdd}
                        disabled={loading}
                    >
                        <Plus color="white" size={20} />
                    </TouchableOpacity>
                </View>
            </View>

            <Text className="text-zinc-500 text-xs font-bold uppercase mb-2">Existing Labels</Text>
            <FlatList
                data={types}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View className="flex-row items-center justify-between p-3 bg-zinc-50 rounded-lg mb-2 border border-zinc-100">
                        <Text className="text-zinc-800 font-medium">{item.name}</Text>
                        <TouchableOpacity onPress={() => handleDelete(item.id)}>
                            <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                )}
            />
        </View>
    );
}
