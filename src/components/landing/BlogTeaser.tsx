/**
 * BlogTeaser — Affiche les 3 derniers articles publiés sous la section "Vous préparez des travaux".
 * Requête client-side Supabase, fallback silencieux si erreur.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowRight } from 'lucide-react';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

interface Post {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  reading_time: number | null;
}

export default function BlogTeaser() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    supabase
      .from('blog_posts')
      .select('slug, title, excerpt, category, reading_time')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(3)
      .then(({ data }) => { if (data) setPosts(data); });
  }, []);

  if (posts.length === 0) return null;

  return (
    <div className="mt-6 pt-5 border-t border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          📚 Nos derniers conseils
        </p>
        <a
          href="/blog"
          className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          Voir tout <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      <ul className="space-y-2">
        {posts.map(post => (
          <li key={post.slug}>
            <a
              href={`/blog/${post.slug}`}
              className="flex items-start justify-between gap-3 group px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 group-hover:text-primary transition-colors leading-snug truncate">
                  {post.title}
                </p>
                {post.category && (
                  <span className="text-[11px] text-slate-400 mt-0.5">{post.category}</span>
                )}
              </div>
              {post.reading_time && (
                <span className="shrink-0 text-[11px] text-slate-300 mt-0.5 whitespace-nowrap">
                  {post.reading_time} min
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
