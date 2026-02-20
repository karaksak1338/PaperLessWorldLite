import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    // if "next" is in param, use it as the redirect address
    const next = searchParams.get('next') ?? '/';

    console.log('--- Auth Callback Started ---');
    console.log('Code present:', !!code);

    if (code) {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        cookieStore.set({ name, value, ...options });
                    },
                    remove(name: string, options: CookieOptions) {
                        cookieStore.set({ name, value: '', ...options });
                    },
                },
            }
        );

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            console.log('Code exchange successful. Redirecting to:', next);
            const response = NextResponse.redirect(`${origin}${next}`);
            // In Next.js 15, ensure cookies are passed back in the redirect response
            return response;
        } else {
            console.error('Code exchange error:', error.message);
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
        }
    }

    console.warn('No code provided in callback.');
    return NextResponse.redirect(`${origin}/login?error=no_code`);
}
