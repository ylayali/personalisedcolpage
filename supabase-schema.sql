-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('inactive', 'active', 'cancelled', 'past_due')),
    subscription_type TEXT CHECK (subscription_type IN ('monthly', 'yearly')),
    total_credits INTEGER DEFAULT 0,
    used_credits INTEGER DEFAULT 0,
    groovesell_customer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    groovesell_order_id TEXT NOT NULL UNIQUE,
    transaction_type TEXT DEFAULT 'purchase' CHECK (transaction_type IN ('purchase', 'refund', 'bonus')),
    credits_added INTEGER NOT NULL DEFAULT 0,
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    subscription_type TEXT CHECK (subscription_type IN ('monthly', 'yearly')),
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create generations table
CREATE TABLE IF NOT EXISTS public.generations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    image_filename TEXT NOT NULL,
    prompt_type TEXT NOT NULL CHECK (prompt_type IN ('straight_copy', 'facial_portrait', 'cartoon_portrait')),
    prompt_text TEXT NOT NULL,
    name_message TEXT,
    background_type TEXT,
    activity_interest TEXT,
    credits_used INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for user_profiles
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON public.user_profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_profiles
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Create RLS policies for generations
CREATE POLICY "Users can view own generations" ON public.generations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generations" ON public.generations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, total_credits)
    VALUES (NEW.id, NEW.email, 3); -- Give 3 free credits on signup
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile for new users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Create function to get user's available credits
CREATE OR REPLACE FUNCTION public.get_available_credits(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT (total_credits - used_credits) 
        FROM public.user_profiles 
        WHERE id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to use credits (atomic operation)
CREATE OR REPLACE FUNCTION public.use_credits(user_uuid UUID, credits_to_use INTEGER DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE
    available_credits INTEGER;
BEGIN
    -- Get current available credits
    SELECT (total_credits - used_credits) INTO available_credits
    FROM public.user_profiles 
    WHERE id = user_uuid;
    
    -- Check if user has enough credits
    IF available_credits >= credits_to_use THEN
        -- Update used credits
        UPDATE public.user_profiles 
        SET used_credits = used_credits + credits_to_use,
            updated_at = NOW()
        WHERE id = user_uuid;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to add credits (for purchases)
CREATE OR REPLACE FUNCTION public.add_credits(user_uuid UUID, credits_to_add INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.user_profiles 
    SET total_credits = total_credits + credits_to_add,
        updated_at = NOW()
    WHERE id = user_uuid;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_groovesell_order_id ON public.transactions(groovesell_order_id);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);
