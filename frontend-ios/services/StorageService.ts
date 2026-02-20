import { supabase } from './supabaseClient';

export interface Document {
    id: string; // UUID in Supabase
    user_id?: string;
    image_uri: string;
    vendor: string | null;
    date: string | null;
    amount: string | null;
    type: string; // 'Invoice' | 'Contract' | 'Receipt' etc.
    created_at: string;
}

export const StorageService = {
    init: async () => {
        // Supabase handled via schema.sql and console, but we ensure client is ready
        console.log('Supabase Storage Service Initialized');
    },

    addDocument: async (doc: Omit<Document, 'id' | 'created_at'>) => {
        const { data, error } = await supabase
            .from('documents')
            .insert([doc])
            .select();

        if (error) throw error;
        return data[0];
    },

    getDocuments: async (): Promise<Document[]> => {
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Document[];
    },

    getDocumentById: async (id: string): Promise<Document | null> => {
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Document;
    },

    updateDocument: async (id: string, updates: Partial<Document>) => {
        const { data, error } = await supabase
            .from('documents')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
        return data;
    },

    deleteDocument: async (id: string, imageUri?: string) => {
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (imageUri) {
            const { error: storageError } = await supabase.storage
                .from('documents')
                .remove([imageUri]);
            if (storageError) console.warn('Could not delete from storage:', storageError);
        }
    },

    getSignedUrl: async (path: string): Promise<string | null> => {
        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(path, 3600);
        if (error) {
            console.error('Error getting signed URL:', error);
            return null;
        }
        return data.signedUrl;
    }
};
