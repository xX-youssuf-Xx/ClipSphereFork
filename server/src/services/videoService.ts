import Video from "../models/Video";
import Review from "../models/Review";
import Follower from "../models/Follower";
import { Types } from "mongoose";
import Like from "../models/Like";
import AppError from "../utils/AppError";
import User from "../models/User";
import { createNotification } from "./notificationService";
import config from "../config/env";
import {
  ACTIVE_VIDEO_EMBEDDING_MODEL,
  generateVideoEmbedding,
} from "./embeddingService";
import { deleteFile } from "../utils/presign";
import { embeddingQueue } from "../queues/embeddingQueue";

/**
 * Convert S3 key to storage URL
 * S3 key: videos/userid/uuid.mp4
 * Storage URL: /storage/clipsphere/videos/userid/uuid.mp4
 */
function getStorageUrl(s3Key: string): string {
  const bucket = process.env.S3_BUCKET || "clipsphere";
  return `/storage/${bucket}/${s3Key}`;
}

type CreateVideoPayload = {
  title: string;
  description?: string;
  tags?: string[];
  videoURL: string;
  duration: number;
  status?: "public" | "private";
};

type UpdateVideoPayload = {
  title?: string;
  description?: string;
  tags?: string[];
};

type CreateReviewPayload = {
  rating: number;
  comment: string;
};

async function refreshVideoEmbedding(videoId: string) {
  const video = await Video.findById(videoId);
  if (!video) throw new AppError("Video not found", 404);

  const embedding = await generateVideoEmbedding({
    title: video.title,
    description: video.description,
    tags: video.tags,
    duration: video.duration,
  });

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      embedding,
      embeddingUpdatedAt: new Date(),
      embeddingModel: ACTIVE_VIDEO_EMBEDDING_MODEL,
      embeddingStatus: "ready",
      embeddingLastError: undefined,
      embeddingNextRetryAt: undefined,
    },
    { new: true, runValidators: true }
  );

  if (!updatedVideo) throw new AppError("Video not found", 404);
  return updatedVideo;
}

function safeErrorString(error: unknown) {
  if (error instanceof Error) return error.stack || error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function computeNextRetryAt(retryCount: number) {
  const baseMs = 30_000; // 30s
  const maxMs = 15 * 60_000; // 15m
  const delayMs = Math.min(maxMs, baseMs * Math.pow(2, Math.min(retryCount, 5)));
  return new Date(Date.now() + delayMs);
}

export async function createVideo(ownerId: string, payload: CreateVideoPayload) {
  const video = await Video.create({
    title: payload.title,
    description: payload.description ?? "",
    tags: payload.tags ?? [],
    owner: ownerId,
    videoURL: payload.videoURL,
    duration: payload.duration,
    status: payload.status ?? "public",
    embeddingStatus: "pending",
  });

  // Offload embedding to the BullMQ worker — API returns immediately
  await embeddingQueue.add(
    "video-embedding",
    { type: "video", videoId: video._id.toString() },
    { jobId: `video-embed-${video._id}` } // deduplicate if re-enqueued
  );

  console.log(`[queue] Enqueued embedding job for video ${video._id}`);
  return video;
}

export async function getVideosByOwner(ownerId: string) {
  const videos = await Video.find({ owner: ownerId, status: "public" })
    .sort({ createdAt: -1 })
    .populate("owner", "username name avatarKey");

  return videos.map(v => {
    const video = v.toObject();
    // Return storage proxied URL
    video.videoURL = getStorageUrl(video.videoURL);
    return video;
  });
}

export async function getAllPublicVideos() {
  const videos = await Video.find({ status: "public" })
    .sort({ createdAt: -1 })
    .populate("owner", "username name avatarKey");

  return videos.map(v => {
    const video = v.toObject();
    // Return storage proxied URL
    video.videoURL = getStorageUrl(video.videoURL);
    return video;
  });
}

export async function getVideo(videoId: string) {
  const video = await Video.findById(videoId)
    .populate("owner", "username name avatarKey");

  if (!video) throw new AppError("Video not found", 404);

  const videoObj = video.toObject();
  // Return storage proxied URL
  videoObj.videoURL = getStorageUrl(videoObj.videoURL);

  return videoObj;
}

export async function updateVideo(videoId: string, payload: UpdateVideoPayload) {
  const updates: UpdateVideoPayload = {};

  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.tags !== undefined) updates.tags = payload.tags;

  const video = await Video.findByIdAndUpdate(videoId, updates, {
    new: true,
    runValidators: true,
  });

  if (!video) throw new AppError("Video not found", 404);

  const shouldRefreshEmbedding =
    payload.title !== undefined ||
    payload.description !== undefined ||
    payload.tags !== undefined;

  if (!shouldRefreshEmbedding) return video;

  // Offload embedding refresh to the BullMQ worker
  await embeddingQueue.add(
    "video-embedding",
    { type: "video", videoId },
    { jobId: `video-embed-${videoId}-${Date.now()}` }
  );

  console.log(`[queue] Enqueued re-embedding job for updated video ${videoId}`);
  return video;
}

export async function deleteVideo(videoId: string) {
  const video = await Video.findById(videoId);
  if (!video) throw new AppError("Video not found", 404);

  // Delete from S3
  await deleteFile(video.videoURL);

  // Delete from DB
  await video.deleteOne();
}

export async function createReview(videoId: string, userId: string, payload: CreateReviewPayload) {
  const video = await Video.findById(videoId);
  if (!video) throw new AppError("Video not found", 404);

  try {
    const review = await Review.create({
      rating: payload.rating,
      comment: payload.comment,
      user: userId,
      video: videoId,
    });

    const actor = await User.findById(userId).select("username name");
    const actorName = actor?.name ?? actor?.username ?? "Someone";
    createNotification({
      recipientId: video.owner.toString(),
      actorId: userId,
      type: "review",
      message: `${actorName} reviewed your video "${video.title}".`,
      link: `/video/${videoId}`,
    }).catch(() => {});

    const stats = await Review.aggregate([
      { $match: { video: new Types.ObjectId(videoId) } },
      { $group: { _id: "$video", avgRating: { $avg: "$rating" }, numReviews: { $sum: 1 } } }
    ]);
    
    if (stats.length > 0) {
      await Video.findByIdAndUpdate(videoId, {
        avgRating: Math.round(stats[0].avgRating * 10) / 10,
        reviewsCount: stats[0].numReviews
      });
    }

    return review;
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError("You have already reviewed this video", 409);
    }

    throw error;
  }
}

export async function getReviewsByVideo(videoId: string) {
  const reviews = await Review.find({ video: videoId })
    .sort({ createdAt: -1 })
    .populate("user", "username name avatarKey");

  return reviews;
}

export async function likeVideo(videoId: string, userId: string) {
  const video = await Video.findById(videoId);
  if (!video) throw new AppError("Video not found", 404);

  try {
    await Like.create({ user: userId, video: videoId });
    await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: 1 } });
    
    try {
      if (video.owner.toString() !== userId) {
        await createNotification({
          recipientId: video.owner.toString(),
          actorId: userId,
          type: "like",
          message: "liked your video",
          link: `/video/${video._id}`
        });
      }
    } catch (err) {
      console.error("Failed to create like notification", err);
    }
    
    return true;
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError("You have already liked this video", 409);
    }
    throw error;
  }
}

export async function unlikeVideo(videoId: string, userId: string) {
  const video = await Video.findById(videoId);
  if (!video) throw new AppError("Video not found", 404);

  const result = await Like.deleteOne({ user: userId, video: videoId });
  if (result.deletedCount && result.deletedCount > 0) {
    await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: -1 } });
  }
  return true;
}

export async function checkHasLiked(videoId: string, userId: string) {
  const like = await Like.findOne({ user: userId, video: videoId });
  return !!like;
}

export async function incrementVideoView(videoId: string) {
  const video = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { viewsCount: 1 } },
    { new: true }
  );
  if (!video) throw new AppError("Video not found", 404);
  return video;
}

export async function getFollowingVideos(userId: string) {
  const follows = await Follower.find({ followerId: userId }).select("followingId -_id").lean();
  const followingIds = follows.map(f => f.followingId);
  
  if (followingIds.length === 0) {
    return [];
  }

  const videos = await Video.find({ owner: { $in: followingIds }, status: "public" })
    .populate("owner", "username name avatarKey")
    .sort({ createdAt: -1 })
    .lean();

  return videos.map((v) => {
    return { ...v, videoURL: getStorageUrl(v.videoURL) };
  });
}
