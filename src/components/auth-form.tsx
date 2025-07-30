'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { useRouter } from 'next/navigation';

type AuthMode = 'login' | 'signup';

type AuthFormProps = {
    mode?: AuthMode;
    onModeChange?: (mode: AuthMode) => void;
};

export function AuthForm({ mode = 'login', onModeChange }: AuthFormProps) {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        // Validation
        if (!email || !password) {
            setError('Please fill in all required fields');
            setIsLoading(false);
            return;
        }

        if (mode === 'signup' && password !== confirmPassword) {
            setError('Passwords do not match');
            setIsLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long');
            setIsLoading(false);
            return;
        }

        try {
            if (mode === 'login') {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                setSuccess('Successfully logged in!');
                router.push('/');
                router.refresh();
            } else {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });

                if (error) throw error;

                if (data.user && !data.user.email_confirmed_at) {
                    setSuccess('Please check your email to confirm your account before logging in.');
                } else {
                    setSuccess('Account created successfully!');
                    router.push('/');
                    router.refresh();
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = () => {
        const newMode = mode === 'login' ? 'signup' : 'login';
        setError(null);
        setSuccess(null);
        if (onModeChange) {
            onModeChange(newMode);
        }
    };

    return (
        <Card className='w-full max-w-md border border-white/20 bg-black'>
            <CardHeader className='text-center'>
                <CardTitle className='text-2xl text-white'>
                    {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </CardTitle>
                <CardDescription className='text-white/60'>
                    {mode === 'login' 
                        ? 'Sign in to create personalized coloring pages' 
                        : 'Sign up to get 3 free coloring pages + subscription access'
                    }
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className='space-y-4'>
                    {error && (
                        <Alert variant='destructive' className='border-red-500/50 bg-red-900/20 text-red-300'>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className='border-green-500/50 bg-green-900/20 text-green-300'>
                            <AlertDescription>{success}</AlertDescription>
                        </Alert>
                    )}
                    
                    <div className='space-y-2'>
                        <Label htmlFor='email' className='text-white'>Email</Label>
                        <Input
                            id='email'
                            type='email'
                            placeholder='your@email.com'
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isLoading}
                            className='border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50'
                            required
                        />
                    </div>
                    
                    <div className='space-y-2'>
                        <Label htmlFor='password' className='text-white'>Password</Label>
                        <Input
                            id='password'
                            type='password'
                            placeholder='••••••••'
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                            className='border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50'
                            required
                        />
                    </div>
                    
                    {mode === 'signup' && (
                        <div className='space-y-2'>
                            <Label htmlFor='confirmPassword' className='text-white'>Confirm Password</Label>
                            <Input
                                id='confirmPassword'
                                type='password'
                                placeholder='••••••••'
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={isLoading}
                                className='border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50'
                                required
                            />
                        </div>
                    )}
                </CardContent>
                <CardFooter className='flex flex-col space-y-4'>
                    <Button
                        type='submit'
                        disabled={isLoading}
                        className='w-full bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40'
                    >
                        {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                        {mode === 'login' ? 'Sign In' : 'Create Account'}
                    </Button>
                    
                    <div className='text-center text-sm text-white/60'>
                        {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button
                            type='button'
                            onClick={switchMode}
                            className='text-white underline hover:text-white/80'
                            disabled={isLoading}
                        >
                            {mode === 'login' ? 'Sign up' : 'Sign in'}
                        </button>
                    </div>
                </CardFooter>
            </form>
        </Card>
    );
}
