import { type Request, type Response, type NextFunction } from "express";
import stripe from "../config/stripe";
import Tip from "../models/Tip";
import User from "../models/User";
import Video from "../models/Video";

export const createTipSession = async (req: Request, res: Response, _next: NextFunction) => {
  if (!stripe) {
    return res.status(500).json({ message: "Stripe not configured" });
  }

  const { videoId, amount, creatorId } = req.body;
  const senderId = (req as any).user?.id;

  if (!senderId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!amount || amount < 1) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return res.status(404).json({ message: "Video not found" });
  }

  const recipient = await User.findById(creatorId || video.owner);
  if (!recipient) {
    return res.status(404).json({ message: "Creator not found" });
  }

  let customerId = (recipient as any).stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId: recipient._id.toString() },
    });
    customerId = customer.id;
    recipient.stripeCustomerId = customerId;
    await recipient.save();
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Tip for ${video.title}`,
            description: `Tip to @${recipient.username}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.CLIENT_URL}/video/${videoId}?tip=success`,
    cancel_url: `${process.env.CLIENT_URL}/video/${videoId}?tip=cancelled`,
    metadata: {
      videoId: videoId.toString(),
      senderId,
      recipientId: recipient._id.toString(),
      amount: amount.toString(),
    },
  });

  const tip = await Tip.create({
    sender: senderId,
    recipient: recipient._id,
    videoId,
    amount,
    stripeSessionId: session.id,
  });

  res.status(200).json({
    data: {
      tip,
      sessionId: session.id,
      url: session.url,
    },
  });
};

export const handleStripeWebhook = async (req: Request, res: Response, _next: NextFunction) => {
  if (!stripe) {
    return res.status(500).json({ message: "Stripe not configured" });
  }

  const rawBody = (req as any).rawBody as Buffer | undefined;
  const sig = req.headers["stripe-signature"] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    return res.status(500).json({ message: "Webhook secret not configured" });
  }

  if (!rawBody) {
    console.error("Webhook - rawBody is missing");
    return res.status(400).json({ message: "Raw body not available" });
  }

  // Parse the stripe-signature header: t=timestamp,v1=sig1,v1=sig2...
  const sigParts = sig.split(",");
  const timestamp = sigParts.find(p => p.startsWith("t="))?.slice(2);
  const stripeSignatures = sigParts
    .filter(p => p.startsWith("v1="))
    .map(p => p.slice(3));

  if (!timestamp || stripeSignatures.length === 0) {
    return res.status(400).json({ message: "Invalid stripe-signature header" });
  }

  // Manual HMAC-SHA256 using Node's native crypto — bypasses Stripe SDK crypto provider issues
  const crypto = await import("crypto");
  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const computedSig = crypto
    .createHmac("sha256", endpointSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  // Timing-safe comparison against all v1 signatures Stripe sent
  const computedBuf = Buffer.from(computedSig, "hex");
  const isValid = stripeSignatures.some(s => {
    try {
      return crypto.timingSafeEqual(computedBuf, Buffer.from(s, "hex"));
    } catch {
      return false;
    }
  });

  // Diagnostic logging — remove once working
  console.log("Webhook - timestamp:", timestamp);
  console.log("Webhook - body length:", rawBody.length);
  console.log("Webhook - body first 30 bytes (hex):", rawBody.subarray(0, 30).toString("hex"));
  console.log("Webhook - computed sig:", computedSig.substring(0, 20));
  console.log("Webhook - stripe sig[0]:", stripeSignatures[0]?.substring(0, 20));
  console.log("Webhook - secret prefix:", endpointSecret.substring(0, 12));
  console.log("Webhook - sigs match:", isValid);

  if (!isValid) {
    const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    console.error(`Webhook - signature mismatch (event age: ${ageSeconds}s)`);
    return res.status(400).json({ message: "Webhook signature verification failed" });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  console.log("Webhook event received:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    const { recipientId } = session?.metadata || {};

    if (recipientId) {
      await Tip.findOneAndUpdate(
        { stripeSessionId: session.id },
        { status: "completed" }
      );
      console.log("Tip marked as completed for session:", session.id);
    }
  }

  res.json({ received: true });
};