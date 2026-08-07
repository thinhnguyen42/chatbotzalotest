import axios from "axios";

/**
 * Client for the BGE-M3 FAQ microservice (bge-m3-service/main.py).
 *
 * BGE-M3 (BAAI/bge-m3) is a state-of-the-art multilingual embedding model.
 * It pre-embeds every FAQ question at startup and matches incoming queries via cosine similarity.
 *
 * Set BGEM3_SERVICE_URL in .env (default: http://localhost:5051).
 * If the service is unavailable, functions return null gracefully so the caller can fall back.
 */

const BGEM3_URL = process.env.BGEM3_SERVICE_URL || "http://localhost:5051";
const TIMEOUT_MS = 3000;

export interface BgeM3MatchResult {
    matched: boolean;
    answer: string;
    topic: string;
    question: string;
    score: number;
}

/**
 * Ask the BGE-M3 service for the best-matching FAQ answer.
 * Returns null if the service is down or match score is below threshold.
 */
export async function matchFaqWithBgeM3(
    userQuery: string,
    threshold?: number
): Promise<BgeM3MatchResult | null> {
    try {
        const res = await axios.post<BgeM3MatchResult>(
            `${BGEM3_URL}/match`,
            { query: userQuery, threshold },
            { timeout: TIMEOUT_MS }
        );
        return res.data;
    } catch (err: any) {
        if (err.code === "ECONNREFUSED" || err.code === "ECONNABORTED") {
            console.warn("[bgeM3Client] BGE-M3 Service unavailable, skipping to next tier.");
        } else {
            console.warn("[bgeM3Client] Error:", err.message);
        }
        return null;
    }
}

/**
 * Reload the FAQ index in the running BGE-M3 service.
 */
export async function reloadBgeM3FaqIndex(): Promise<boolean> {
    try {
        await axios.post(`${BGEM3_URL}/reload`, {}, { timeout: 5000 });
        console.log("[bgeM3Client] BGE-M3 FAQ index reloaded.");
        return true;
    } catch {
        return false;
    }
}

/**
 * Health check for BGE-M3 service.
 */
export async function isBgeM3ServiceHealthy(): Promise<boolean> {
    try {
        const res = await axios.get(`${BGEM3_URL}/health`, { timeout: TIMEOUT_MS });
        return res.status === 200;
    } catch {
        return false;
    }
}
