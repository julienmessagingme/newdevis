-- Table blog_posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text,
  content_html text NOT NULL,
  category text DEFAULT 'Devis & Conseils',
  tags text[] DEFAULT '{}',
  cover_image_url text,
  status text CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published articles
CREATE POLICY "Anyone can read published articles"
ON public.blog_posts
FOR SELECT
USING (status = 'published');

-- Admins can do everything
CREATE POLICY "Admins can manage all articles"
ON public.blog_posts
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_blog_posts_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for slug lookup
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at DESC);