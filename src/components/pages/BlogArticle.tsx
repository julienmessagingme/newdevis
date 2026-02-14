import React, { useState, useEffect } from "react";
import { ArrowLeft, Clock, Tag, Calendar, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/SEOHead";
import ArticleContent from "@/components/blog/ArticleContent";
import BlogCTA from "@/components/blog/BlogCTA";
import { calculateReadingTime, formatArticleDate, getCTAUrl } from "@/lib/blogUtils";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_html: string;
  category: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  mid_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  updated_at: string | null;
}

/** Split HTML into 3 parts: before mid-image, beside mid-image (max 3 blocks), after */
const splitHtmlForMidImage = (html: string): { before: string; beside: string; after: string } => {
  const blockRegex = /(<(?:h[1-6]|p|ul|ol|div|blockquote|table|section|figure)\b[^>]*>[\s\S]*?<\/(?:h[1-6]|p|ul|ol|div|blockquote|table|section|figure)>)/gi;
  const blocks: string[] = [];
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    blocks.push(match[0]);
  }

  if (blocks.length < 4) {
    return { before: html, beside: "", after: "" };
  }

  const midStart = Math.ceil(blocks.length / 2);
  const midEnd = Math.min(midStart + 3, blocks.length);

  return {
    before: blocks.slice(0, midStart).join("\n"),
    beside: blocks.slice(midStart, midEnd).join("\n"),
    after: blocks.slice(midEnd).join("\n"),
  };
};

const MidImageSection = ({ imageUrl, alt, contentHtml }: { imageUrl: string; alt: string; contentHtml: string }) => (
  <div className="my-10">
    <div className="grid md:grid-cols-2 gap-8 items-start">
      <img
        src={imageUrl}
        alt={alt}
        className="w-full h-auto rounded-xl shadow-md"
        loading="lazy"
      />
      <div>
        <ArticleContent html={contentHtml} />
      </div>
    </div>
  </div>
);

const BlogArticle = () => {
  const slug = window.location.pathname.split('/').pop();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      fetchPost(slug);
    }
  }, [slug]);

  const fetchPost = async (postSlug: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", postSlug)
        .eq("status", "published")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          setError("Article non trouvé");
        } else {
          throw fetchError;
        }
        return;
      }

      setPost(data);
    } catch (err) {
      console.error("Error fetching post:", err);
      setError("Erreur lors du chargement de l'article");
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: post?.title,
          text: post?.excerpt || "",
          url: window.location.href,
        });
      } catch {
        // Share cancelled by user
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      // Could show a toast here
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 container px-4 py-12">
          <div className="max-w-3xl mx-auto animate-pulse">
            <div className="h-8 bg-muted rounded w-1/4 mb-4" />
            <div className="h-12 bg-muted rounded mb-4" />
            <div className="h-4 bg-muted rounded w-1/3 mb-8" />
            <div className="space-y-4">
              <div className="h-4 bg-muted rounded" />
              <div className="h-4 bg-muted rounded" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">
              {error || "Article non trouvé"}
            </h1>
            <p className="text-muted-foreground mb-6">
              L'article que vous recherchez n'existe pas ou a été supprimé.
            </p>
            <Button asChild>
              <a href="/blog">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour au blog
              </a>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const readingTime = calculateReadingTime(post.content_html);
  const ctaUrl = getCTAUrl();

  // Schema.org Article markup
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo_description || post.excerpt,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: {
      "@type": "Organization",
      name: "VerifierMonDevis.fr",
    },
    publisher: {
      "@type": "Organization",
      name: "VerifierMonDevis.fr",
      logo: {
        "@type": "ImageObject",
        url: "https://verifiermondevis.fr/logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://verifiermondevis.fr/blog/${post.slug}`,
    },
    ...(post.cover_image_url && { image: post.cover_image_url }),
  };

  return (
    <>
      <SEOHead
        title={post.seo_title || post.title}
        description={post.seo_description || post.excerpt || ""}
        canonical={`https://verifiermondevis.fr/blog/${post.slug}`}
        ogType="article"
        ogImage={post.cover_image_url || undefined}
      />

      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="flex-1">
          {/* Article Header */}
          <section className="py-12 md:py-16 bg-gradient-to-b from-primary/5 to-background">
            <div className="container px-4 md:px-6">
              <div className="max-w-3xl mx-auto">
                <a
                  href="/blog"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour au blog
                </a>

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {post.category && (
                    <Badge variant="secondary">
                      <Tag className="h-3 w-3 mr-1" />
                      {post.category}
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {readingTime} min de lecture
                  </div>
                  {post.published_at && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatArticleDate(post.published_at)}
                    </div>
                  )}
                </div>

                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                  {post.title}
                </h1>

                {post.excerpt && (
                  <p className="text-lg text-muted-foreground">
                    {post.excerpt}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-6">
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Partager
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Cover Image */}
          {post.cover_image_url && (
            <section className="pb-8">
              <div className="container px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                  <img
                    src={post.cover_image_url}
                    alt={post.title}
                    className="w-full h-auto rounded-2xl shadow-lg"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Article Content */}
          <section className="py-8 md:py-12">
            <div className="container px-4 md:px-6">
              <div className="max-w-3xl mx-auto">
                {/* Top CTA */}
                <BlogCTA variant="top" />

                {/* Article Body */}
                {post.mid_image_url ? (() => {
                  const { before, beside, after } = splitHtmlForMidImage(post.content_html);
                  return (
                    <>
                      <ArticleContent html={before} />
                      {beside && (
                        <MidImageSection
                          imageUrl={post.mid_image_url}
                          alt={`Illustration - ${post.title}`}
                          contentHtml={beside}
                        />
                      )}
                      {after && <ArticleContent html={after} />}
                    </>
                  );
                })() : (
                  <ArticleContent html={post.content_html} />
                )}

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">Tags :</span>
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom CTA */}
                <BlogCTA variant="bottom" />
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default BlogArticle;
