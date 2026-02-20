import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { X, Camera as CameraIcon, Image as ImageIcon } from 'lucide-react-native';
import { OCRService } from '../services/OCRService';
import { StorageService } from '../services/StorageService';
import { ReminderService } from '../services/ReminderService';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

export default function ScanScreen() {
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const handleGalleryUpload = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            try {
                setIsProcessing(true);
                const ocrResult = await OCRService.processImage(result.assets[0].uri);

                const newDoc = await StorageService.addDocument({
                    image_uri: (ocrResult as any).imagePath,
                    vendor: ocrResult.vendor,
                    date: ocrResult.date,
                    amount: ocrResult.amount,
                    type: ocrResult.type as any,
                });

                if ((ocrResult as any).aiFailed) {
                    Alert.alert(
                        'AI Analysis Partial',
                        'Document saved, but AI extraction was unavailable. Please edit details manually.',
                        [{ text: 'OK', onPress: () => router.replace(`/details/${newDoc.id}`) }]
                    );
                } else {
                    router.replace(`/details/${newDoc.id}`);
                }
            } catch (error: any) {
                console.error('Upload failed:', error);
                Alert.alert('Error', error.message || 'Gallery upload failed');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const takePicture = async () => {
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setIsProcessing(true);
                const photoUri = result.assets[0].uri;

                const ocrResult = await OCRService.processImage(photoUri);

                const newDoc = await StorageService.addDocument({
                    image_uri: (ocrResult as any).imagePath,
                    vendor: ocrResult.vendor,
                    date: ocrResult.date,
                    amount: ocrResult.amount,
                    type: ocrResult.type as any,
                });

                if (newDoc.date) {
                    await ReminderService.scheduleDocumentReminder(newDoc.id, newDoc.vendor || 'Document', newDoc.date);
                }

                setIsProcessing(false);

                if ((ocrResult as any).aiFailed) {
                    Alert.alert(
                        'AI Analysis Partial',
                        'Document saved, but AI extraction was unavailable. Please edit details manually.',
                        [{ text: 'OK', onPress: () => router.replace(`/details/${newDoc.id}`) }]
                    );
                } else {
                    router.replace(`/details/${newDoc.id}`);
                }
            }
        } catch (error: any) {
            setIsProcessing(false);
            Alert.alert('Error', error.message || 'Failed to process document');
            console.error(error);
        }
    };

    return (
        <View className="flex-1 bg-zinc-950">
            <SafeAreaView className="flex-1">
                {/* Header */}
                <View className="flex-row justify-between items-center px-6 py-4">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full bg-white/10">
                        {/* @ts-ignore */}
                        <X color="white" size={24} />
                    </TouchableOpacity>
                    <Text className="text-white text-lg font-bold">New Document</Text>
                    <View className="w-10" />
                </View>

                {/* Main Action Area */}
                <View className="flex-1 justify-center items-center px-8">
                    {isProcessing ? (
                        <View className="items-center">
                            <ActivityIndicator size="large" color="#3b82f6" />
                            <Text className="text-white mt-4 font-semibold text-lg">Analyzing Document...</Text>
                        </View>
                    ) : (
                        <View className="w-full gap-6">
                            <TouchableOpacity
                                onPress={takePicture}
                                className="bg-blue-600 p-8 rounded-3xl flex-row items-center justify-center shadow-xl"
                            >
                                <CameraIcon color="white" size={32} />
                                <Text className="text-white font-bold text-2xl ml-4">Scan Document</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleGalleryUpload}
                                className="bg-zinc-900 p-6 rounded-2xl flex-row items-center justify-center border border-zinc-800"
                            >
                                <ImageIcon color="#9ca3af" size={24} />
                                <Text className="text-zinc-400 font-bold text-lg ml-3">Choose from Gallery</Text>
                            </TouchableOpacity>

                            <View className="mt-8 bg-zinc-900/30 p-4 rounded-xl border border-white/5">
                                <Text className="text-zinc-500 text-center text-xs leading-5">
                                    Capture clarity is key for AI processing.{"\n"}
                                    Ensure good lighting and avoid shadows.
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
            </SafeAreaView>
        </View>
    );
}
