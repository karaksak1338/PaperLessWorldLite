import { View, Text, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { Plus, Search, X, Settings, BarChart3, Database, Cpu } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageService, Document } from '../services/StorageService';
import { ReminderService } from '../services/ReminderService';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DocumentCard from '../components/DocumentCard';
import * as ImagePicker from 'expo-image-picker';
import { OCRService } from '../services/OCRService';

export default function Home() {
    const router = useRouter();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const [displayLimit, setDisplayLimit] = useState(10);

    // Initialize DB on mount
    useEffect(() => {
        StorageService.init().catch(console.error);
    }, []);

    const fetchDocuments = useCallback(async () => {
        try {
            const docs = await StorageService.getDocuments();
            setDocuments(docs);
        } catch (error) {
            console.error('Failed to fetch documents:', error);
        }
    }, []);

    // Reload docs when screen is focused
    useFocusEffect(
        useCallback(() => {
            fetchDocuments();
            // Request permissions
            ReminderService.requestPermissions();
        }, [fetchDocuments])
    );

    const handleGalleryUpload = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            try {
                setIsUploading(true);
                const ocrResult = await OCRService.processImage(result.assets[0].uri);
                await StorageService.addDocument({
                    image_uri: (ocrResult as any).imagePath,
                    vendor: ocrResult.vendor,
                    date: ocrResult.date,
                    amount: ocrResult.amount,
                    type: ocrResult.type as any,
                });
                fetchDocuments();
            } catch (error) {
                console.error('Upload failed:', error);
            } finally {
                setIsUploading(false);
            }
        }
    };

    const filteredDocuments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const baseFiltered = !query
            ? documents
            : documents.filter(doc =>
                doc.vendor?.toLowerCase().includes(query) ||
                doc.type?.toLowerCase().includes(query) ||
                String(doc.amount || '').toLowerCase().includes(query)
            );
        return baseFiltered;
    }, [documents, searchQuery]);

    const displayedDocuments = useMemo(() => {
        return filteredDocuments.slice(0, displayLimit);
    }, [filteredDocuments, displayLimit]);

    const stats = useMemo(() => {
        return {
            total: documents.length,
            ai: documents.filter(d => d.amount).length,
            sync: 'Active'
        };
    }, [documents]);

    const handleDelete = useCallback(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    return (
        <View className="flex-1 bg-white px-4 pt-4">
            {isUploading && (
                <View className="absolute inset-0 bg-white/80 z-50 items-center justify-center">
                    <Text className="text-blue-600 font-semibold text-lg">Processing Gallery Image...</Text>
                </View>
            )}

            {/* Search Bar & Settings */}
            <View className="flex-row items-center mb-6">
                <View className="flex-1 flex-row items-center bg-zinc-100 rounded-lg px-3 py-1">
                    {/* @ts-ignore */}
                    <Search size={18} color="#71717a" />
                    <TextInput
                        className="flex-1 ml-2 py-2 text-zinc-900 text-sm"
                        placeholder="Search docs..."
                        placeholderTextColor="#71717a"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        clearButtonMode="while-editing"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            {/* @ts-ignore */}
                            <X size={16} color="#71717a" />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    className="ml-3 p-2 bg-zinc-100 rounded-lg"
                    onPress={() => router.push('/settings')}
                >
                    {/* @ts-ignore */}
                    <Settings size={20} color="#3f3f46" />
                </TouchableOpacity>
            </View>

            {/* List or Empty State */}
            {filteredDocuments.length === 0 ? (
                <View className="flex-1 justify-center items-center">
                    <Text className="text-zinc-400 text-lg mb-2">
                        {searchQuery ? 'No matching documents.' : 'No documents yet.'}
                    </Text>
                    {!searchQuery && (
                        <Text className="text-zinc-400 text-sm text-center px-8">
                            Tap the + button to scan your first document.
                        </Text>
                    )}
                </View>
            ) : (
                <FlatList
                    data={displayedDocuments}
                    keyExtractor={(item) => item.id}
                    ListHeaderComponent={() => (
                        <View className="flex-row justify-between mb-6">
                            <View className="bg-zinc-50 border border-zinc-100 p-3 rounded-xl flex-1 mr-2 items-center">
                                {/* @ts-ignore */}
                                <BarChart3 size={16} color="#3f3f46" className="mb-1" />
                                <Text className="text-zinc-400 text-[10px] uppercase font-bold">Total</Text>
                                <Text className="text-zinc-900 font-bold text-base">{stats.total}</Text>
                            </View>
                            <View className="bg-zinc-50 border border-zinc-100 p-3 rounded-xl flex-1 mx-1 items-center">
                                {/* @ts-ignore */}
                                <Cpu size={16} color="#3f3f46" className="mb-1" />
                                <Text className="text-zinc-400 text-[10px] uppercase font-bold">AI</Text>
                                <Text className="text-zinc-900 font-bold text-base">{stats.ai}</Text>
                            </View>
                            <View className="bg-zinc-50 border border-zinc-100 p-3 rounded-xl flex-1 ml-2 items-center">
                                {/* @ts-ignore */}
                                <Database size={16} color="#3f3f46" className="mb-1" />
                                <Text className="text-zinc-400 text-[10px] uppercase font-bold">Vault</Text>
                                <Text className="text-emerald-600 font-bold text-sm">Active</Text>
                            </View>
                        </View>
                    )}
                    ListFooterComponent={() => (
                        filteredDocuments.length > displayLimit ? (
                            <TouchableOpacity
                                className="py-4 items-center bg-zinc-50 rounded-xl border border-zinc-100 mb-8"
                                onPress={() => setDisplayLimit(prev => prev + 10)}
                            >
                                <Text className="text-blue-600 font-bold">Load More Documents</Text>
                            </TouchableOpacity>
                        ) : null
                    )}
                    renderItem={({ item }) => <DocumentCard doc={item} onDelete={handleDelete} />}
                    contentContainerStyle={{ paddingBottom: 150 }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Buttons Container */}
            <View className="absolute bottom-8 right-6 gap-3 items-center">
                <TouchableOpacity
                    className="bg-zinc-800 w-12 h-12 rounded-full justify-center items-center shadow-lg"
                    onPress={handleGalleryUpload}
                >
                    {/* @ts-ignore */}
                    <Search color="white" size={20} />
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-blue-600 w-16 h-16 rounded-full justify-center items-center shadow-lg"
                    onPress={() => router.push('/scan')}
                >
                    {/* @ts-ignore */}
                    <Plus color="white" size={32} />
                </TouchableOpacity>
            </View>
        </View>
    );
}
