import React, { useEffect, useState } from 'react';
import { View, Image, Text } from 'react-native';
import { FileText } from 'lucide-react-native';
import { StorageService } from '../services/StorageService';

export default function DocumentThumbnail({ path, type }: { path?: string, type: string }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (path) {
            StorageService.getSignedUrl(path).then(setUrl).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [path]);

    if (!path) {
        const isInvoice = type.toLowerCase().includes('invoice');
        const isReceipt = type.toLowerCase().includes('receipt');
        const isContract = type.toLowerCase().includes('contract');

        return (
            <View className={`w-full h-full items-center justify-center ${isInvoice ? 'bg-blue-100' :
                    isReceipt ? 'bg-emerald-100' :
                        isContract ? 'bg-purple-100' : 'bg-zinc-100'
                }`}>
                <FileText size={20} color={
                    isInvoice ? '#2563eb' :
                        isReceipt ? '#059669' :
                            isContract ? '#9333ea' : '#71717a'
                } />
            </View>
        );
    }

    if (loading) return <View className="w-full h-full bg-zinc-50" />;

    if (!url) return (
        <View className="w-full h-full items-center justify-center bg-zinc-100">
            <FileText size={20} color="#9ca3af" />
        </View>
    );

    return (
        <Image
            source={{ uri: url }}
            className="w-full h-full"
            resizeMode="cover"
        />
    );
}
