import { supabase } from './supabaseClient';

export interface ExtractedData {
    vendor: string | null;
    date: string | null;
    amount: string | null;
    type: string;
    confidence: number;
    imagePath: string;
    aiFailed?: boolean;
    errorMessage?: string;
}

export const OCRService = {
    processImage: async (imageUri: string): Promise<ExtractedData> => {
        // 1. Upload image to Supabase Storage first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileName = `${user.id}/${Date.now()}.jpg`;
        const formData = new FormData();
        // @ts-ignore
        formData.append('file', {
            uri: imageUri,
            name: fileName.split('/').pop(), // just the filename part for form-data
            type: 'image/jpeg',
        });

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, formData);

        if (uploadError) throw uploadError;

        // 2. Call Supabase Edge Function to perform AI OCR
        // This keeps the OpenAI API key secure on the backend.
        try {
            const { data, error } = await supabase.functions.invoke('process-document', {
                body: { imagePath: uploadData.path }
            });

            if (error) {
                console.error("OCR Function Error Context:", JSON.stringify(error, null, 2));
                // Extract body from FunctionsHttpError if possible
                if ((error as any).context) {
                    try {
                        const body = await (error as any).context.json();
                        throw new Error(body.error || body.details || body.message || "AI Analysis failed");
                    } catch (e) {
                        throw new Error(`AI Service Error (${(error as any).status || 'Unknown status'})`);
                    }
                }
                throw error;
            }

            return {
                ...data,
                imagePath: uploadData.path
            };
        } catch (aiError: any) {
            console.warn("AI Analysis failed, falling back to manual metadata:", aiError.message);
            // Return placeholder data so the document can still be saved
            return {
                vendor: "Review Needed",
                date: new Date().toISOString().split('T')[0],
                amount: null,
                type: "Other",
                confidence: 0,
                imagePath: uploadData.path,
                // @ts-ignore - Adding custom flag for UI feedback
                aiFailed: true,
                errorMessage: aiError.message
            };
        }
    }
};
