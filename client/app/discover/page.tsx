"use client";

import { useState, useEffect } from "react";
import { Play, Eye, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { VideoFeedSkeleton } from "@/components/VideoCardSkeleton";
import { useAuth } from "@/contexts/AuthContext";
import API, { getS3Endpoint } from "@/lib/api";

const S3_ENDPOINT = getS3Endpoint();

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function Discover() {
  const [activeTab, setActiveTab] = useState("trending");
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  function authHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    async function load() {
      if (activeTab === "following" && !user) {
        setVideos([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        let endpoint: string;
        let options: RequestInit = {};

        if (activeTab === "following") {
          endpoint = `${API}/videos/feed/following`;
          options = { headers: authHeaders() };
        } else if (user) {
          endpoint = `${API}/recommendations/feed`;
          options = { headers: authHeaders() };
        } else {
          endpoint = `${API}/recommendations/trending`;
        }

        const res = await fetch(endpoint, options);
        if (!res.ok) return;
        const data = await res.json();
        setVideos(data.data.videos ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeTab, user]);

  const sorted = [...videos].sort((a, b) => {
    if (activeTab === "trending") return (b.score ?? b.trendingScore ?? 0) - (a.score ?? a.trendingScore ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-16 z-30 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">Discover</h1>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full md:w-auto bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="trending" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />Trending
              </TabsTrigger>
              <TabsTrigger value="following" className="flex items-center gap-2">
                <Users className="w-4 h-4" />Following
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="px-4 py-6 max-w-7xl mx-auto">
        {activeTab === "following" && !user ? (
          <div className="text-center py-20 text-zinc-400">
            <p className="mb-4">Log in to see videos from users you follow</p>
            <Link href="/auth">
              <Button className="bg-violet-600 hover:bg-violet-700 text-white">Log In</Button>
            </Link>
          </div>
        ) : loading ? (
          /* ── Skeleton loaders ── */
          <VideoFeedSkeleton count={6} />
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            {activeTab === "following" ? "You aren't following anyone with videos yet!" : "No videos yet. Be the first to upload!"}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((video: any) => {
              const owner = video.owner;
              const ownerName = owner?.name ?? owner?.username ?? "Unknown";
              const ownerAvatar = owner?.avatarKey ? `${S3_ENDPOINT}/clipsphere/${owner.avatarKey}` : "";

              return (
                <Card
                  key={video._id}
                  className="group bg-zinc-900 border-zinc-800 overflow-hidden hover:border-violet-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-violet-900/20"
                >
                  <Link href={`/video/${video._id}`}>
                    <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                      {/* Thumbnail */}
                      {video.videoURL ? (
                        <VideoThumbnail
                          videoUrl={video.videoURL}
                          className="absolute inset-0 z-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                        />
                      ) : null}

                      {/* ── Glassmorphism gradient overlay ── */}
                      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />

                      {/* ── Glassmorphism play button ── */}
                      <div className="absolute inset-0 z-20 flex items-center justify-center">
                        {/* Idle: subtle translucent icon */}
                        <div className="group-hover:opacity-0 transition-opacity duration-200">
                          <Play className="w-12 h-12 text-white/30 drop-shadow-lg" />
                        </div>
                        {/* Hover: full glass pill */}
                        <div className="absolute opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
                          <div className="w-16 h-16 rounded-full flex items-center justify-center
                                          bg-white/10 backdrop-blur-md
                                          border border-white/20
                                          shadow-2xl shadow-violet-900/60
                                          ring-1 ring-violet-400/30">
                            <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
                          </div>
                        </div>
                      </div>

                      {/* ── Glassmorphism duration badge ── */}
                      <Badge className="absolute z-20 top-2 right-2
                                        bg-black/40 backdrop-blur-md
                                        border border-white/10
                                        text-white text-xs font-medium
                                        shadow-sm">
                        {formatDuration(video.duration ?? 0)}
                      </Badge>

                      {/* ── Glassmorphism stats bar (bottom on hover) ── */}
                      <div className="absolute z-20 bottom-0 left-0 right-0
                                      px-3 py-2
                                      bg-black/30 backdrop-blur-md
                                      border-t border-white/5
                                      flex items-center gap-3 text-white text-xs
                                      translate-y-full group-hover:translate-y-0
                                      transition-transform duration-300 ease-out">
                        <span className="flex items-center gap-1 font-medium">
                          <Eye className="w-3 h-3 opacity-70" />
                          {formatCount(video.viewsCount ?? 0)}
                        </span>
                        {video.avgRating > 0 && (
                          <span className="flex items-center gap-1 font-medium ml-auto">
                            <span className="text-yellow-400">★</span>
                            {video.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="p-4">
                    <Link href={`/video/${video._id}`}>
                      <h3 className="font-semibold text-white mb-3 line-clamp-2 hover:text-violet-400 transition-colors">
                        {video.title}
                      </h3>
                    </Link>

                    <Link href={`/profile/${owner?._id ?? owner?.id}`} className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={ownerAvatar} />
                        <AvatarFallback className="text-xs bg-violet-800 text-white">
                          {ownerName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-zinc-400 hover:text-white transition-colors truncate">
                        {ownerName}
                      </span>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
