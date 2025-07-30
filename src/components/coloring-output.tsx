'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, Download, Printer } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

type ImageInfo = {
    path: string;
    filename: string;
};

type ColoringOutputProps = {
    imageBatch: ImageInfo[] | null;
    altText?: string;
    isLoading: boolean;
    photoPreview?: string | null;
};

export function ColoringOutput({
    imageBatch,
    altText = 'Generated coloring page',
    isLoading,
    photoPreview
}: ColoringOutputProps) {
    const generatedImage = imageBatch?.[0];

    const handleDownload = async () => {
        if (!generatedImage) return;

        try {
            const response = await fetch(generatedImage.path);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = generatedImage.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    const handlePrint = () => {
        if (!generatedImage) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title></title>
                <style>
                    /* Remove all margins and padding */
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    /* Page setup - remove browser headers/footers */
                    @page {
                        margin: 0;
                        size: auto;
                    }
                    
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        background: white !important;
                        overflow: hidden;
                    }
                    
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    
                    img {
                        max-width: 100%;
                        max-height: 100vh;
                        object-fit: contain;
                        display: block;
                    }
                    
                    @media print {
                        @page {
                            margin: 0 !important;
                            padding: 0 !important;
                        }
                        
                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            height: 100% !important;
                            overflow: visible !important;
                        }
                        
                        body {
                            padding: 0 !important;
                            background: white !important;
                        }
                        
                        img {
                            width: 100% !important;
                            height: auto !important;
                            max-height: 100vh !important;
                            page-break-inside: avoid !important;
                            object-fit: contain !important;
                        }
                    }
                </style>
            </head>
            <body>
                <img src="${generatedImage.path}" alt="" onload="window.print(); window.close();" />
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className='flex h-full min-h-[300px] w-full flex-col items-center justify-between gap-4 overflow-hidden rounded-lg border border-white/20 bg-black p-4'>
            <div className='relative flex h-full w-full flex-grow items-center justify-center overflow-hidden'>
                {isLoading ? (
                    photoPreview ? (
                        <div className='relative flex h-full w-full items-center justify-center'>
                            <Image
                                src={photoPreview}
                                alt='Uploaded photo preview'
                                fill
                                style={{ objectFit: 'contain' }}
                                className='blur-md filter'
                                unoptimized
                            />
                            <div className='absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white/80'>
                                <Loader2 className='mb-2 h-8 w-8 animate-spin' />
                                <p>Creating your coloring page...</p>
                            </div>
                        </div>
                    ) : (
                        <div className='flex flex-col items-center justify-center text-white/60'>
                            <Loader2 className='mb-2 h-8 w-8 animate-spin' />
                            <p>Creating your coloring page...</p>
                        </div>
                    )
                ) : generatedImage ? (
                    <Image
                        src={generatedImage.path}
                        alt={altText}
                        width={512}
                        height={768}
                        className='max-h-full max-w-full object-contain'
                        unoptimized
                    />
                ) : (
                    <div className='text-center text-white/40'>
                        <p>Your coloring page will appear here.</p>
                        <p className='mt-2 text-sm'>Upload a photo and fill out the form to get started.</p>
                    </div>
                )}
            </div>

            {generatedImage && !isLoading && (
                <div className='flex h-10 w-full shrink-0 items-center justify-center gap-4'>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={handleDownload}
                        className='shrink-0 border-white/20 text-white/80 hover:bg-white/10 hover:text-white'>
                        <Download className='mr-2 h-4 w-4' />
                        Download
                    </Button>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={handlePrint}
                        className='shrink-0 border-white/20 text-white/80 hover:bg-white/10 hover:text-white'>
                        <Printer className='mr-2 h-4 w-4' />
                        Print This Page
                    </Button>
                </div>
            )}
        </div>
    );
}
