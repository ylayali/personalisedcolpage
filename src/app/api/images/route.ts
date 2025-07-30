import crypto from 'crypto';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { createClient } from '@/lib/supabase/server';

const outputDir = path.resolve(process.cwd(), 'generated-images');

// Define valid output formats for type safety
const VALID_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const;
type ValidOutputFormat = (typeof VALID_OUTPUT_FORMATS)[number];

// Validate and normalize output format
function validateOutputFormat(format: unknown): ValidOutputFormat {
    const normalized = String(format || 'png').toLowerCase();

    // Handle jpg -> jpeg normalization
    const mapped = normalized === 'jpg' ? 'jpeg' : normalized;

    if (VALID_OUTPUT_FORMATS.includes(mapped as ValidOutputFormat)) {
        return mapped as ValidOutputFormat;
    }

    return 'png'; // default fallback
}

async function ensureOutputDirExists() {
    try {
        await fs.access(outputDir);
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            try {
                await fs.mkdir(outputDir, { recursive: true });
                console.log(`Created output directory: ${outputDir}`);
            } catch (mkdirError) {
                console.error(`Error creating output directory ${outputDir}:`, mkdirError);
                throw new Error('Failed to create image output directory.');
            }
        } else {
            console.error(`Error accessing output directory ${outputDir}:`, error);
            throw new Error(
                `Failed to access or ensure image output directory exists. Original error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

export async function POST(request: NextRequest) {
    console.log('Received POST request to /api/images');

    if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is not set.');
        return NextResponse.json({ error: 'Server configuration error: OpenAI API key not found.' }, { status: 500 });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
        console.error('REPLICATE_API_TOKEN is not set.');
        return NextResponse.json({ error: 'Server configuration error: Replicate API token not found.' }, { status: 500 });
    }
    try {
        let effectiveStorageMode: 'fs' | 'indexeddb';
        const explicitMode = process.env.NEXT_PUBLIC_IMAGE_STORAGE_MODE;
        const isOnVercel = process.env.VERCEL === '1';

        if (explicitMode === 'fs') {
            effectiveStorageMode = 'fs';
        } else if (explicitMode === 'indexeddb') {
            effectiveStorageMode = 'indexeddb';
        } else if (isOnVercel) {
            effectiveStorageMode = 'indexeddb';
        } else {
            effectiveStorageMode = 'fs';
        }
        console.log(
            `Effective Image Storage Mode: ${effectiveStorageMode} (Explicit: ${explicitMode || 'unset'}, Vercel: ${isOnVercel})`
        );

        if (effectiveStorageMode === 'fs') {
            await ensureOutputDirExists();
        }

        const formData = await request.formData();

        // Check for user authentication and credits
        const userToken = formData.get('userToken') as string | null;
        if (userToken) {
            try {
                const supabase = await createClient();
                const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
                
                if (authError || !user) {
                    console.error('Authentication failed:', authError);
                    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
                }

                // Check if user has available credits
                const { data: profile, error: profileError } = await supabase
                    .from('user_profiles')
                    .select('total_credits, used_credits')
                    .eq('id', user.id)
                    .single();

                if (profileError || !profile) {
                    console.error('Error fetching user profile:', profileError);
                    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
                }

                const availableCredits = profile.total_credits - profile.used_credits;
                if (availableCredits <= 0) {
                    return NextResponse.json({ 
                        error: 'Insufficient credits. Please purchase more credits to continue.' 
                    }, { status: 403 });
                }

                console.log(`User ${user.email} has ${availableCredits} credits available`);
            } catch (error) {
                console.error('Auth verification error:', error);
                return NextResponse.json({ error: 'Authentication verification failed' }, { status: 401 });
            }
        } else if (process.env.APP_PASSWORD) {
            // Fallback to password auth if no user token
            const clientPasswordHash = formData.get('passwordHash') as string | null;
            if (!clientPasswordHash) {
                console.error('Missing authentication.');
                return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
            }
            const serverPasswordHash = sha256(process.env.APP_PASSWORD);
            if (clientPasswordHash !== serverPasswordHash) {
                console.error('Invalid password hash.');
                return NextResponse.json({ error: 'Unauthorized: Invalid password.' }, { status: 401 });
            }
        } else {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const mode = formData.get('mode') as 'generate' | 'edit' | null;
        const prompt = formData.get('prompt') as string | null;

        console.log(`Mode: ${mode}, Prompt: ${prompt ? prompt.substring(0, 50) + '...' : 'N/A'}`);

        if (!mode || !prompt) {
            return NextResponse.json({ error: 'Missing required parameters: mode and prompt' }, { status: 400 });
        }

        // Check if this is a coloring page request (has image_0 file)
        const imageFile = formData.get('image_0') as File | null;
        
        if (!imageFile) {
            return NextResponse.json({ error: 'Image file is required for coloring page generation' }, { status: 400 });
        }

        // Convert the image file to base64 for Replicate API
        const imageBuffer = await imageFile.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const imageDataUri = `data:${imageFile.type};base64,${imageBase64}`;

        // Prepare Replicate API request
        const replicatePayload = {
            input: {
                prompt: prompt,
                quality: 'high',
                background: 'auto',
                moderation: 'low',
                aspect_ratio: '2:3', // This gives us the portrait orientation!
                input_images: [{ value: { path: imageDataUri } }],
                output_format: 'png',
                input_fidelity: 'high',
                openai_api_key: process.env.OPENAI_API_KEY,
                number_of_images: 1,
                output_compression: 90
            }
        };

        console.log('Calling Replicate API for portrait coloring page generation');

        // Call Replicate API
        const replicateResponse = await fetch('https://api.replicate.com/v1/models/openai/gpt-image-1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait'
            },
            body: JSON.stringify(replicatePayload)
        });

        if (!replicateResponse.ok) {
            const errorText = await replicateResponse.text();
            console.error('Replicate API error:', errorText);
            throw new Error(`Replicate API failed: ${replicateResponse.status} ${errorText}`);
        }

        const replicateResult = await replicateResponse.json();
        console.log('Replicate API call successful');

        if (!replicateResult.output || !Array.isArray(replicateResult.output) || replicateResult.output.length === 0) {
            console.error('Invalid or empty data received from Replicate API:', replicateResult);
            return NextResponse.json({ error: 'Failed to retrieve image data from API.' }, { status: 500 });
        }

        // Process the results - Replicate returns URLs, we need to fetch and convert to base64
        const savedImagesData = await Promise.all(
            replicateResult.output.map(async (imageUrl: string, index: number) => {
                // Fetch the image from the URL
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) {
                    throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
                }
                
                const imageBuffer = await imageResponse.arrayBuffer();
                const imageBase64 = Buffer.from(imageBuffer).toString('base64');
                const timestamp = Date.now();

                const fileExtension = validateOutputFormat(formData.get('output_format'));
                const filename = `${timestamp}-${index}.${fileExtension}`;

                if (effectiveStorageMode === 'fs') {
                    const filepath = path.join(outputDir, filename);
                    console.log(`Attempting to save image to: ${filepath}`);
                    await fs.writeFile(filepath, Buffer.from(imageBuffer));
                    console.log(`Successfully saved image: ${filename}`);
                }

                const imageResult: { filename: string; b64_json: string; path?: string; output_format: string } = {
                    filename: filename,
                    b64_json: imageBase64,
                    output_format: fileExtension
                };

                if (effectiveStorageMode === 'fs') {
                    imageResult.path = `/api/image/${filename}`;
                }

                return imageResult;
            })
        );

        console.log(`All images processed. Mode: ${effectiveStorageMode}`);

        return NextResponse.json({ images: savedImagesData });
    } catch (error: unknown) {
        console.error('Error in /api/images:', error);

        let errorMessage = 'An unexpected error occurred.';
        let status = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
            if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
                status = error.status;
            }
        } else if (typeof error === 'object' && error !== null) {
            if ('message' in error && typeof error.message === 'string') {
                errorMessage = error.message;
            }
            if ('status' in error && typeof error.status === 'number') {
                status = error.status;
            }
        }

        return NextResponse.json({ error: errorMessage }, { status });
    }
}
