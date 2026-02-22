import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS })
    }

    try {
        const { imagePath } = await req.json()
        if (!imagePath) throw new Error("imagePath is required")

        // 1. Setup Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ""
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim()

        if (!geminiApiKey) {
            console.error("Missing GEMINI_API_KEY")
            return new Response(JSON.stringify({ error: "Edge Function missing GEMINI_API_KEY secret" }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 2. Fetch the image from Supabase Storage
        console.log(`[1/4] Fetching image: ${imagePath}`)
        const cleanPath = imagePath.replace(/^\/+/, "")

        const { data: fileData, error: fileError } = await supabase.storage
            .from('documents')
            .download(cleanPath)

        if (fileError) {
            console.error("Storage Error:", fileError)
            return new Response(JSON.stringify({ error: `Storage access failed: ${fileError.message}` }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // Convert Blob to Base64 efficiently
        console.log(`[2/4] Converting image to base64 (${fileData.size} bytes)`)
        const arrayBuffer = await fileData.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            binary += String.fromCharCode(...uint8Array.slice(i, i + chunkSize))
        }
        const base64Image = btoa(binary)

        // 3. Call Google Gemini 2.5 Flash (Verified working for your account)
        console.log("[3/4] Requesting Gemini 2.5 Flash Analysis...")

        // Detect MIME type 
        let mimeType = "image/jpeg";
        if (cleanPath.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf";
        else if (cleanPath.toLowerCase().endsWith(".png")) mimeType = "image/png";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Extract document details as JSON: { \"vendor\": string, \"date\": \"YYYY-MM-DD\", \"amount\": string, \"type\": \"Invoice\"|\"Receipt\"|\"Contract\"|\"Other\", \"confidence\": number }. Use the text in the document. For 'amount', extract ONLY the numeric value (e.g. '1251.74' instead of '1251.74 EUR'). If numeric amount is not found, use null. Return ONLY the JSON object." },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }]
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error("Gemini Error:", errorText)
            return new Response(JSON.stringify({ error: `AI Provider Error: ${response.statusText}`, details: errorText }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                status: 502,
            })
        }

        const aiResult = await response.json()
        console.log("[4/4] Gemini response received.")

        let content = aiResult.candidates[0].content.parts[0].text;

        // Clean up markdown code blocks if the AI includes them
        content = content.replace(/```json\s?|\s?```/g, '').trim();
        const extracted = JSON.parse(content);

        // EXTRA SAFETY: Force sanitization of amount string
        if (extracted.amount && typeof extracted.amount === 'string') {
            // Strip everything except numbers, dots, and commas (then normalize to dot)
            extracted.amount = extracted.amount.replace(/[^0-9.,]/g, '').replace(',', '.');
        }

        return new Response(JSON.stringify(extracted), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Critical Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
