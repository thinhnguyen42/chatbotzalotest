import axios from "axios";

/**
 * Client for the Vietnamese Bi-Encoder FAQ microservice (vi-encoder-service/main.py).
 *
 * Uses bkai-foundation-models/vietnamese-bi-encoder — a PhoBERT-based bi-encoder
 * fine-tuned specifically for Vietnamese semantic search.
 *
 * Set VI_ENCODER_SERVICE_URL in .env (default: http://localhost:5051).
 * If the service is unavailable, functions return null gracefully so the caller can fall back.
 */

const VI_ENCODER_URL = process.env.VI_ENCODER_SERVICE_URL || "http://localhost:5051";
const TIMEOUT_MS = 8000;

export interface ViEncoderMatchResult {
    matched: boolean;
    answer: string;
    topic: string;
    question: string;
    score: number;
}

/**
 * Ask the Vietnamese Bi-Encoder service for the best-matching FAQ answer.
 * Returns null if the service is down or match score is below threshold.
 */
export async function matchFaqWithViEncoder(
    userQuery: string,
    threshold?: number
): Promise<ViEncoderMatchResult | null> {
    try {
        const res = await axios.post<ViEncoderMatchResult>(
            `${VI_ENCODER_URL}/match`,
            { query: userQuery, threshold },
            { timeout: TIMEOUT_MS }
        );
        return res.data;
    } catch (err: any) {
        if (err.code === "ECONNREFUSED" || err.code === "ECONNABORTED") {
            console.warn("[viEncoderClient] Vi-Encoder Service unavailable, skipping to next tier.");
        } else {
            console.warn("[viEncoderClient] Error:", err.message);
        }
        return null;
    }
}

/**
 * Reload the FAQ index in the running Vi-Encoder service.
 */
export async function reloadViEncoderFaqIndex(): Promise<boolean> {
    try {
        await axios.post(`${VI_ENCODER_URL}/reload`, {}, { timeout: 5000 });
        console.log("[viEncoderClient] Vi-Encoder FAQ index reloaded.");
        return true;
    } catch {
        return false;
    }
}

/**
 * Health check for Vi-Encoder service.
 */
export async function isViEncoderServiceHealthy(): Promise<boolean> {
    try {
        const res = await axios.get(`${VI_ENCODER_URL}/health`, { timeout: TIMEOUT_MS });
        return res.status === 200;
    } catch {
        return false;
    }
}
