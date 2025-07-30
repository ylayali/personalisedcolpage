'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, User, Palette, Activity } from 'lucide-react';
import * as React from 'react';

export type ColoringFormData = {
    photo: File;
    coloringPageType: 'straight_copy' | 'facial_portrait' | 'cartoon_portrait';
    nameMessage?: string;
    background?: 'plain' | 'mindful';
    activityInterest?: string;
};

type ColoringFormProps = {
    onSubmit: (data: ColoringFormData) => void;
    isLoading: boolean;
    userCredits: number;
};

const generatePrompt = (data: ColoringFormData): string => {
    const { coloringPageType, nameMessage, background, activityInterest } = data;
    
    // Helper to replace placeholder with actual value or empty string
    const replaceName = (prompt: string) => nameMessage ? prompt.replace('[NAME]', nameMessage) : prompt;
    const replaceActivity = (prompt: string) => activityInterest ? prompt.replace('[ACTIVITY]', activityInterest) : prompt;

    if (coloringPageType === 'straight_copy') {
        if (!nameMessage) {
            return 'turn the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result, as large as possible whilst still looking elegant, centered vertically and horizontally on a plain white background';
        } else {
            return replaceName('turn the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. write [NAME] in friendly white letters with black outline, suited to a coloring page. place the writing unobtrusively on top of the line drawing, ensuring it doesn\'t obscure the subject\'s face. finally center the whole thing, as large as possible whilst still looking elegant, on a plain white background.');
        }
    }

    if (coloringPageType === 'facial_portrait') {
        const isPlain = background === 'plain';
        const hasName = !!nameMessage;
        
        if (!hasName && isPlain) {
            return 'turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result, as large as possible whilst still looking elegant, inside a plain white box with a black outline. center this horizontally and vertically on a plain white background';
        } else if (hasName && isPlain) {
            return replaceName('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result, as large as possible whilst still looking elegant, inside a plain white box with a black outline. below this box write [NAME] in friendly white letters with black outline, suited to a coloring page. center this collection of objects horizontally and vertically on a plain white background');
        } else if (!hasName && !isPlain) {
            return 'turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result, as large as possible whilst still looking elegant, inside a plain white box with a black outline. center this horizontally and vertically on top of an abstract pattern suitable for mindful coloring';
        } else {
            return replaceName('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result, as large as possible whilst still looking elegant, inside a plain white box with a black outline. below this box write [NAME] in friendly white letters with black outline, suited to a coloring page. center this collection of objects horizontally and vertically on top of an abstract pattern suitable for mindful coloring');
        }
    }

    if (coloringPageType === 'cartoon_portrait') {
        const isPlain = background === 'plain';
        const hasName = !!nameMessage;
        const hasActivity = !!activityInterest;
        
        if (!hasName && isPlain && !hasActivity) {
            return 'turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style. place this result as large as possible whilst still looking elegant, centered horizontally and vertically on a plain white background';
        } else if (hasName && isPlain && !hasActivity) {
            return replaceName('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style. below this write [NAME] in friendly white letters with black outline, suited to a coloring page. finally place this collection of objects as large as possible whilst still looking elegant, centered horizontally and vertically on a plain white background');
        } else if (!hasName && isPlain && hasActivity) {
            return replaceActivity('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style engaged in [ACTIVITY]. place this result as large as possible whilst still looking elegant, centered horizontally and vertically on a plain white background');
        } else if (hasName && isPlain && hasActivity) {
            return replaceActivity(replaceName('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style engaged in [ACTIVITY]. below this write [NAME] in friendly white letters with black outline, suited to a coloring page. finally place this collection of objects as large as possible whilst still looking elegant, centered horizontally and vertically on a plain white background'));
        } else if (!hasName && !isPlain && !hasActivity) {
            return 'turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style. place this result as large as possible whilst still looking elegant, centered horizontally and vertically on top of an abstract pattern suitable for mindful coloring';
        } else if (hasName && !isPlain && !hasActivity) {
            return replaceName('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style. below this write [NAME] in friendly white letters with black outline, suited to a coloring page. finally place this collection of objects as large as possible whilst still looking elegant, centered horizontally and vertically on top of an abstract pattern suitable for mindful coloring');
        } else if (!hasName && !isPlain && hasActivity) {
            return replaceActivity('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style engaged in [ACTIVITY]. place this result as large as possible whilst still looking elegant, centered horizontally and vertically on top of an abstract pattern suitable for mindful coloring');
        } else {
            return replaceActivity(replaceName('turn the face from the attached photo into a line drawing suitable for a coloring page, ensuring accurate facial features are maintained. place the result onto a cartoon style line drawing body in the same coloring page style engaged in [ACTIVITY]. below this write [NAME] in friendly white letters with black outline, suited to a coloring page. finally place this collection of objects as large as possible whilst still looking elegant, centered horizontally and vertically on top of an abstract pattern suitable for mindful coloring'));
        }
    }

    return '';
};

export function ColoringForm({ onSubmit, isLoading, userCredits }: ColoringFormProps) {
    const [photo, setPhoto] = React.useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
    const [coloringPageType, setColoringPageType] = React.useState<ColoringFormData['coloringPageType']>('straight_copy');
    const [nameMessage, setNameMessage] = React.useState('');
    const [background, setBackground] = React.useState<'plain' | 'mindful'>('plain');
    const [activityInterest, setActivityInterest] = React.useState('');

    const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setPhoto(file);
            const previewUrl = URL.createObjectURL(file);
            setPhotoPreview(previewUrl);
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!photo) return;

        const formData: ColoringFormData = {
            photo,
            coloringPageType,
            nameMessage: nameMessage.trim() || undefined,
            background: coloringPageType !== 'straight_copy' ? background : undefined,
            activityInterest: coloringPageType === 'cartoon_portrait' && activityInterest.trim() ? activityInterest.trim() : undefined
        };

        onSubmit(formData);
    };

    React.useEffect(() => {
        return () => {
            if (photoPreview) {
                URL.revokeObjectURL(photoPreview);
            }
        };
    }, [photoPreview]);

    const showBackgroundOption = coloringPageType !== 'straight_copy';
    const showActivityOption = coloringPageType === 'cartoon_portrait';
    const canSubmit = photo && userCredits > 0 && !isLoading;

    return (
        <Card className='flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-black'>
            <CardHeader className='border-b border-white/10 pb-4'>
                <div className='flex items-center justify-between'>
                    <div>
                        <CardTitle className='text-lg font-medium text-white'>Create Coloring Page</CardTitle>
                        <CardDescription className='mt-1 text-white/60'>
                            Upload a photo to create a personalized coloring page
                        </CardDescription>
                    </div>
                    <div className='text-right'>
                        <div className='text-sm text-white/60'>Credits</div>
                        <div className='text-xl font-bold text-white'>{userCredits}</div>
                    </div>
                </div>
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex h-full flex-1 flex-col overflow-hidden'>
                <CardContent className='flex-1 space-y-5 overflow-y-auto p-4'>
                    {/* Photo Upload */}
                    <div className='space-y-2'>
                        <Label htmlFor='photo' className='text-white'>
                            Upload Photo
                        </Label>
                        <div className='flex items-center gap-4'>
                            <Input
                                id='photo'
                                type='file'
                                accept='image/*'
                                onChange={handlePhotoChange}
                                disabled={isLoading}
                                className='rounded-md border border-white/20 bg-black text-white file:border-0 file:bg-white/10 file:text-white focus:border-white/50'
                            />
                            {photoPreview && (
                                <div className='h-16 w-16 overflow-hidden rounded border border-white/20'>
                                    <img
                                        src={photoPreview}
                                        alt='Photo preview'
                                        className='h-full w-full object-cover'
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Coloring Page Type */}
                    <div className='space-y-3'>
                        <Label className='block text-white'>Coloring Page Type</Label>
                        <Select
                            value={coloringPageType}
                            onValueChange={(value) => setColoringPageType(value as ColoringFormData['coloringPageType'])}
                            disabled={isLoading}>
                            <SelectTrigger className='rounded-md border border-white/20 bg-black text-white focus:border-white/50'>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className='border border-white/20 bg-black text-white'>
                                <SelectItem value='straight_copy'>Straight copy of photo</SelectItem>
                                <SelectItem value='facial_portrait'>Facial portrait</SelectItem>
                                <SelectItem value='cartoon_portrait'>Cartoon portrait</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Name/Short Message */}
                    <div className='space-y-2'>
                        <Label htmlFor='name-message' className='flex items-center gap-2 text-white'>
                            <User className='h-4 w-4' />
                            Name/Short Message (Optional)
                        </Label>
                        <Input
                            id='name-message'
                            type='text'
                            placeholder='e.g., Sarah, Happy Birthday, etc.'
                            value={nameMessage}
                            onChange={(e) => setNameMessage(e.target.value)}
                            disabled={isLoading}
                            className='rounded-md border border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50'
                        />
                    </div>

                    {/* Background (conditional) */}
                    {showBackgroundOption && (
                        <div className='space-y-3'>
                            <Label className='flex items-center gap-2 text-white'>
                                <Palette className='h-4 w-4' />
                                Background
                            </Label>
                            <RadioGroup
                                value={background}
                                onValueChange={(value) => setBackground(value as 'plain' | 'mindful')}
                                disabled={isLoading}
                                className='flex gap-6'>
                                <div className='flex items-center space-x-2'>
                                    <RadioGroupItem
                                        value='plain'
                                        id='bg-plain'
                                        className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
                                    />
                                    <Label htmlFor='bg-plain' className='cursor-pointer text-white/80'>
                                        Plain
                                    </Label>
                                </div>
                                <div className='flex items-center space-x-2'>
                                    <RadioGroupItem
                                        value='mindful'
                                        id='bg-mindful'
                                        className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
                                    />
                                    <Label htmlFor='bg-mindful' className='cursor-pointer text-white/80'>
                                        Mindful coloring
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>
                    )}

                    {/* Activity/Interest (conditional) */}
                    {showActivityOption && (
                        <div className='space-y-2'>
                            <Label htmlFor='activity' className='flex items-center gap-2 text-white'>
                                <Activity className='h-4 w-4' />
                                Activity/Interest (Optional)
                            </Label>
                            <Textarea
                                id='activity'
                                placeholder='e.g., playing football, reading books, dancing, etc.'
                                value={activityInterest}
                                onChange={(e) => setActivityInterest(e.target.value)}
                                disabled={isLoading}
                                rows={2}
                                className='rounded-md border border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50'
                            />
                        </div>
                    )}

                    {userCredits === 0 && (
                        <div className='rounded-md border border-yellow-500/50 bg-yellow-900/20 p-3'>
                            <p className='text-yellow-300'>
                                You have no credits remaining.{' '}
                                <a
                                    href='https://FarawayGrandparents.com/colorpages-packages'
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='underline hover:text-yellow-200'>
                                    Purchase more credits
                                </a>{' '}
                                to continue creating coloring pages.
                            </p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-white/10 p-4'>
                    <Button
                        type='submit'
                        disabled={!canSubmit}
                        className='flex w-full items-center justify-center gap-2 rounded-md bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40'>
                        {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
                        {isLoading ? 'Creating Coloring Page...' : 'Create Coloring Page'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

export { generatePrompt };
