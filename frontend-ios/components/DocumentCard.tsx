import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { FileText, ChevronRight, AlertCircle, Trash2, Bell } from 'lucide-react-native';
import { Link } from 'expo-router';
import { StorageService } from '../services/StorageService';
import DocumentThumbnail from './DocumentThumbnail';

export default function DocumentCard({ doc, onDelete }: { doc: any, onDelete?: () => void }) {
    const handleDelete = () => {
        Alert.alert(
            "Delete Document",
            "Are you sure you want to delete this document? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        StorageService.deleteDocument(doc.id, doc.image_uri);
                        if (onDelete) onDelete();
                    }
                }
            ]
        );
    };

    return (
        <View className="flex-row items-center mb-2">
            <Link href={`/details/${doc.id}`} asChild>
                <TouchableOpacity className="flex-1 flex-row items-center bg-white p-3 rounded-lg border border-zinc-100 shadow-sm">
                    <View className="w-10 h-10 rounded-md overflow-hidden mr-3">
                        <DocumentThumbnail path={doc.image_uri} type={doc.type} />
                    </View>

                    <View className="flex-1">
                        <Text className="font-semibold text-zinc-800 text-sm" numberOfLines={1}>{doc.vendor || 'Unknown Vendor'}</Text>
                        <View className="flex-row items-center">
                            <Text className="text-zinc-500 text-xs">{doc.date || 'No Date'}</Text>
                            <Text className="text-zinc-300 text-xs mx-1">•</Text>
                            <Text className="text-zinc-500 text-xs">{doc.type}</Text>
                        </View>
                    </View>

                    <View className="items-end mr-2">
                        {doc.amount && <Text className="text-zinc-900 font-bold text-sm mb-1">${doc.amount}</Text>}
                        {doc.expiringSoon && (
                            <AlertCircle color="#ef4444" size={14} />
                        )}
                        {doc.reminder_date && (
                            <Bell color="#3b82f6" size={14} className={doc.amount ? "mt-1" : ""} />
                        )}
                    </View>

                    <ChevronRight color="#d4d4d8" size={18} />
                </TouchableOpacity>
            </Link>

            <TouchableOpacity
                onPress={handleDelete}
                className="ml-2 bg-zinc-50 w-10 h-10 items-center justify-center rounded-lg border border-zinc-100"
            >
                <Trash2 size={16} color="#ef4444" />
            </TouchableOpacity>
        </View>
    );
}
