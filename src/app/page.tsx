'use client';

import { ColoringForm, type ColoringFormData, generatePrompt } from '@/components/coloring-form';
import { ColoringOutput } from '@/components/coloring-output';
import { AuthForm } from '@/components/auth-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import { LogOut, CreditCard, Loader2 } from 'lucide-react';
import * as React from 'react';

type ApiImageResponseItem = {
    filename: string;
    b64_json?: string;
    output_format: string;
    path?: string;
};

const explicitModeClient = process.env.NEXT_PUBLIC_IMAGE_STORAGE_MODE;
const vercelEnvClient = process.env.NEXT_PUBLIC_VERCEL_ENV;
const isOnVercelClient = vercelEnvClient === 'production' || vercelEnvClient === 'preview';

let effectiveStorageModeClient: 'fs' | 'indexeddb';

if (explicitModeClient === 'fs') {
    effectiveStorageModeClient = 'fs';
} else if (explicitModeClient === 'indexeddb') {
    effectiveStorageModeClient = 'indexeddb';
} else if (isOnVercelClient) {
    effectiveStorageModeClient = 'indexeddb';
} else {
    effectiveStorageModeClient = 'fs';
}

export default function HomePage() {
    const [user, setUser] = React.useState<{ id: string; email?: string } | null>(null);
    const [userProfile, setUserProfile] = React.useState<{ total_credits: number; used_credits: number; subscription_status: string } | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [latestImageBatch, setLatestImageBatch] = React.useState<{ path: string; filename: string }[] | null>(null);
    const [blobUrlCache, setBlobUrlCache] = React.useState<Record<string, string>>({});
    const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
    const [showAuthForm, setShowAuthForm] = React.useState(false);
    const [authMode, setAuthMode] = React.useState<'login' | 'signup'>('login');
    const [isLoadingAuth, setIsLoadingAuth] = React.useState(true);

    const supabase = createClient();

    // Check authentication status and load user profile
    React.useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                
                if (session?.user) {
                    setUser(session.user);
                    
                    // Load user profile
                    const { data: profile, error } = await supabase
                        .from('user_profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();
                    
                    if (profile) {
                        setUserProfile(profile);
                    } else if (error) {
                        console.error('Error loading user profile:', error);
                    }
                } else {
                    setShowAuthForm(true);
                }
            } catch (error) {
                console.error('Auth check error:', error);
                setShowAuthForm(true);
            } finally {
                setIsLoadingAuth(false);
            }
        };

        checkAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                setUser(session.user);
                setShowAuthForm(false);
                
                // Load user profile
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                
                if (profile) {
                    setUserProfile(profile);
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setUserProfile(null);
                setShowAuthForm(true);
            }
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    React.useEffect(() => {
        return () => {
            console.log('Revoking blob URLs:', Object.keys(blobUrlCache).length);
            Object.values(blobUrlCache).forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, [blobUrlCache]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    const handlePurchaseCredits = () => {
        window.open('https://FarawayGrandparents.com/colorpages-packages', '_blank');
    };

    const getMimeTypeFromFormat = (format: string): string => {
        if (format === 'jpeg') return 'image/jpeg';
        if (format === 'webp') return 'image/webp';
        return 'image/png';
    };

    const handleApiCall = async (formData: ColoringFormData) => {
        if (!user || !userProfile) {
            setError('Please log in to create coloring pages');
            return;
        }

        const availableCredits = userProfile.total_credits - userProfile.used_credits;
        if (availableCredits <= 0) {
            setError('No credits remaining. Please purchase more credits to continue.');
            return;
        }

        const startTime = Date.now();
        let durationMs = 0;

        setIsLoading(true);
        setError(null);
        setLatestImageBatch(null);

        // Create photo preview URL for loading state
        const previewUrl = URL.createObjectURL(formData.photo);
        setPhotoPreview(previewUrl);

        const apiFormData = new FormData();
        
        // Add user token for authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            apiFormData.append('userToken', session.access_token);
        }

        // Generate the prompt based on form data
        const prompt = generatePrompt(formData);
        
        apiFormData.append('mode', 'generate');
        apiFormData.append('prompt', prompt);
        apiFormData.append('n', '1');
        apiFormData.append('size', '1024x1536'); // Portrait size for coloring pages
        apiFormData.append('quality', 'high');
        apiFormData.append('output_format', 'png');
        apiFormData.append('background', 'auto');
        apiFormData.append('moderation', 'auto');
        
        // Add the photo as an image file for the API
        apiFormData.append('image_0', formData.photo, formData.photo.name);

        console.log('Sending request to /api/images with coloring page data');
        console.log('Generated prompt:', prompt);

        try {
            const response = await fetch('/api/images', {
                method: 'POST',
                body: apiFormData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `API request failed with status ${response.status}`);
            }

            console.log('API Response:', result);

            if (result.images && result.images.length > 0) {
                durationMs = Date.now() - startTime;
                console.log(`API call successful. Duration: ${durationMs}ms`);

                // Use credit via Supabase function
                const { data: creditUsed, error: creditError } = await supabase
                    .rpc('use_credits', { user_uuid: user.id, credits_to_use: 1 });

                if (creditError || !creditUsed) {
                    console.error('Error using credits:', creditError);
                    setError('Error updating credits. Please try again.');
                    return;
                }

                // Refresh user profile to show updated credits
                const { data: updatedProfile } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (updatedProfile) {
                    setUserProfile(updatedProfile);
                }

                // Record the generation
                await supabase
                    .from('generations')
                    .insert({
                        user_id: user.id,
                        image_filename: result.images[0].filename,
                        prompt_type: formData.coloringPageType,
                        prompt_text: prompt,
                        name_message: formData.nameMessage,
                        background_type: formData.background,
                        activity_interest: formData.activityInterest
                    });

                let newImageBatchPromises: Promise<{ path: string; filename: string } | null>[] = [];
                if (effectiveStorageModeClient === 'indexeddb') {
                    console.log('Processing images for IndexedDB storage...');
                    newImageBatchPromises = result.images.map(async (img: ApiImageResponseItem) => {
                        if (img.b64_json) {
                            try {
                                const byteCharacters = atob(img.b64_json);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);

                                const actualMimeType = getMimeTypeFromFormat(img.output_format);
                                const blob = new Blob([byteArray], { type: actualMimeType });

                                await db.images.put({ filename: img.filename, blob });
                                console.log(`Saved ${img.filename} to IndexedDB with type ${actualMimeType}.`);

                                const blobUrl = URL.createObjectURL(blob);
                                setBlobUrlCache((prev) => ({ ...prev, [img.filename]: blobUrl }));

                                return { filename: img.filename, path: blobUrl };
                            } catch (dbError) {
                                console.error(`Error saving blob ${img.filename} to IndexedDB:`, dbError);
                                setError(`Failed to save image ${img.filename} to local database.`);
                                return null;
                            }
                        } else {
                            console.warn(`Image ${img.filename} missing b64_json in indexeddb mode.`);
                            return null;
                        }
                    });
                } else {
                    newImageBatchPromises = result.images
                        .filter((img: ApiImageResponseItem) => !!img.path)
                        .map((img: ApiImageResponseItem) =>
                            Promise.resolve({
                                path: img.path!,
                                filename: img.filename
                            })
                        );
                }

                const processedImages = (await Promise.all(newImageBatchPromises)).filter(Boolean) as {
                    path: string;
                    filename: string;
                }[];

                setLatestImageBatch(processedImages);
            } else {
                setLatestImageBatch(null);
                throw new Error('API response did not contain valid image data or filenames.');
            }
        } catch (err: unknown) {
            durationMs = Date.now() - startTime;
            console.error(`API Call Error after ${durationMs}ms:`, err);
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
            setError(errorMessage);
            setLatestImageBatch(null);
        } finally {
            if (durationMs === 0) durationMs = Date.now() - startTime;
            setIsLoading(false);
            // Clean up photo preview
            URL.revokeObjectURL(previewUrl);
            setPhotoPreview(null);
        }
    };

    // Show loading screen while checking authentication
    if (isLoadingAuth) {
        return (
            <main className='flex min-h-screen items-center justify-center bg-black text-white'>
                <div className='text-center'>
                    <Loader2 className='mx-auto mb-4 h-8 w-8 animate-spin' />
                    <p>Loading...</p>
                </div>
            </main>
        );
    }

    // Show authentication form if not logged in
    if (showAuthForm || !user) {
        return (
            <main className='flex min-h-screen items-center justify-center bg-black p-4'>
                <div className='w-full max-w-md'>
                    <div className='text-center mb-8'>
                        <h1 className='text-3xl font-bold text-white mb-2'>Personalized Coloring Pages</h1>
                        <p className='text-white/60'>Sign up to get 3 free coloring pages</p>
                    </div>
                    <AuthForm 
                        mode={authMode} 
                        onModeChange={setAuthMode}
                    />
                </div>
            </main>
        );
    }

    const availableCredits = userProfile ? userProfile.total_credits - userProfile.used_credits : 0;
    const needsSubscription = availableCredits <= 0 && userProfile?.subscription_status !== 'active';

    return (
        <main className='flex min-h-screen flex-col items-center bg-black p-4 text-white md:p-8 lg:p-12'>
            <div className='w-full max-w-7xl space-y-6'>
                {/* Header with user info */}
                <div className='flex items-center justify-between mb-8'>
                    <div className='text-center flex-1'>
                        <h1 className='text-3xl font-bold text-white mb-2'>Personalized Coloring Pages</h1>
                        <p className='text-white/60'>Upload a photo to create unique coloring pages</p>
                    </div>
                    <div className='flex items-center gap-4'>
                        <div className='text-right'>
                            <div className='text-sm text-white/60'>Credits</div>
                            <div className='text-xl font-bold text-white'>{availableCredits}</div>
                        </div>
                        <div className='flex gap-2'>
                            <Button
                                variant='outline'
                                size='sm'
                                onClick={handlePurchaseCredits}
                                className='border-white/20 text-white/80 hover:bg-white/10'
                            >
                                <CreditCard className='mr-2 h-4 w-4' />
                                Buy Credits
                            </Button>
                            <Button
                                variant='outline'
                                size='sm'
                                onClick={handleSignOut}
                                className='border-white/20 text-white/80 hover:bg-white/10'
                            >
                                <LogOut className='mr-2 h-4 w-4' />
                                Sign Out
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Subscription warning */}
                {needsSubscription && (
                    <Alert className='border-yellow-500/50 bg-yellow-900/20 text-yellow-300'>
                        <AlertTitle>Subscribe for More Credits</AlertTitle>
                        <AlertDescription>
                            You&apos;ve used your free credits! Subscribe for $9.95/month or $97/year to get 5 coloring pages per month.{' '}
                            <button
                                onClick={handlePurchaseCredits}
                                className='underline hover:text-yellow-200'
                            >
                                Subscribe now
                            </button>
                        </AlertDescription>
                    </Alert>
                )}

                <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
                    <div className='relative flex h-[70vh] min-h-[600px] flex-col lg:col-span-1'>
                        <ColoringForm
                            onSubmit={handleApiCall}
                            isLoading={isLoading}
                            userCredits={availableCredits}
                        />
                    </div>
                    <div className='flex h-[70vh] min-h-[600px] flex-col lg:col-span-1'>
                        {error && (
                            <Alert variant='destructive' className='mb-4 border-red-500/50 bg-red-900/20 text-red-300'>
                                <AlertTitle className='text-red-200'>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <ColoringOutput
                            imageBatch={latestImageBatch}
                            altText='Generated coloring page'
                            isLoading={isLoading}
                            photoPreview={photoPreview}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}
