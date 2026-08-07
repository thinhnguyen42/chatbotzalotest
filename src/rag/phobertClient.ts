import axios from "axios";

/**
 * Client for the PhoBERT FAQ microservice (phobert-service/main.py).
 *
 * The service pre-embeds every FAQ question with PhoBERT (vinai/phobert-base)
 * at startup and matches incoming user messages via cosine similarity.
 *
 * Set PHOBERT_SERVICE_URL in .env (default: http://localhost:5050).
 * If the service is unavailable the functions return null gracefully so the
 * caller can fall back to Gemini embeddings.
 */

const PHOBERT_URL = process.env.PHOBERT_SERVICE_URL || "http://localhost:5050";
const TIMEOUT_MS = 3000; // fail fast so Gemini fallback kicks in quickly

export interface PhoBertMatchResult {
    matched: boolean;
    answer: string;
    topic: string;
    question: string;
    score: number;
}

/**
 * Ask the PhoBERT service for the best-matching FAQ answer.
 * Returns null if the service is down or the match score is below threshold.
 */
export async function matchFaqWithPhoBert(
    userQuery: string,
    threshold?: number
): Promise<PhoBertMatchResult | null> {
    try {
        const res = await axios.post<PhoBertMatchResult>(
            `${PHOBERT_URL}/match`,
            { query: userQuery, threshold },
            { timeout: TIMEOUT_MS }
        );
        return res.data;
    } catch (err: any) {
        // Service unavailable - silently fall back
        if (err.code === "ECONNREFUSED" || err.code === "ECONNABORTED") {
            console.warn("[phobertClient] Service unavailable, falling back to Gemini.");
        } else {
            console.warn("[phobertClient] Error:", err.message);
        }
        return null;
    }
}

/**
 * Reload the FAQ index in the running PhoBERT service after faq.md changes.
 */
export async function reloadPhoBertFaqIndex(): Promise<boolean> {
    try {
        await axios.post(`${PHOBERT_URL}/reload`, {}, { timeout: 5000 });
        console.log("[phobertClient] FAQ index reloaded.");
        return true;
    } catch {
        return false;
    }
}

/**
 * Health check – returns true when the service is up.
 */
export async function isPhoBertServiceHealthy(): Promise<boolean> {
    try {
        const res = await axios.get(`${PHOBERT_URL}/health`, { timeout: TIMEOUT_MS });
        return res.status === 200;
    } catch {
        return false;
    }
}
