// functions/src/index.ts
import { onRequest, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { kkiapay as kkiapayServer } from "@kkiapay-org/nodejs-sdk";

// --- Secrets à définir via CLI (voir commandes plus bas)
const KKIA_PUBLIC = defineSecret("KKIA_PUBLIC_KEY");
const KKIA_PRIVATE = defineSecret("KKIA_PRIVATE_KEY");
const KKIA_SECRET = defineSecret("KKIA_SECRET_KEY");
const KKIA_WEBHOOK_SECRET = defineSecret("KKIA_WEBHOOK_SECRET");
// Optionnel: "true"/"false" pour sandbox
const KKIA_SANDBOX = defineSecret("KKIA_SANDBOX");

admin.initializeApp();
const db = admin.firestore();

// Client Kkiapay côté serveur
function makeKkiapayClient() {
  const sandboxRaw = KKIA_SANDBOX.value();
  const sandbox =
    typeof sandboxRaw === "string" &&
    sandboxRaw.toLowerCase().trim() === "true";

  // D’après le SDK: { privatekey, publickey, secretkey, sandbox? }
  // https://github.com/kkiapay/nodejs-sdk
  return kkiapayServer({
    privatekey: KKIA_PRIVATE.value(),
    publickey: KKIA_PUBLIC.value(),
    secretkey: KKIA_SECRET.value(),
    sandbox,
  });
}

/**
 * Webhook KKiaPay
 * - Vérifie l'en-tête x-kkiapay-secret
 * - Concilie le statut avec verify(transactionId)
 * - Écrit dans payments/{transactionId}
 */
export const kkiapayWebhook = onRequest(
  {
    region: "europe-west1",
    secrets: [
      KKIA_WEBHOOK_SECRET,
      KKIA_PUBLIC,
      KKIA_PRIVATE,
      KKIA_SECRET,
      KKIA_SANDBOX,
    ],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Vérification simple du secret transmis par KKiaPay
    // (en-tête x-kkiapay-secret défini côté Dashboard Webhook)
    const headerSecret = req.header("x-kkiapay-secret");
    const expected = KKIA_WEBHOOK_SECRET.value();
    if (!headerSecret || !expected || headerSecret !== expected) {
      console.warn("Invalid webhook signature", { hasHeader: !!headerSecret });
      res.status(401).send("Invalid signature");
      return;
    }

    const body = req.body as any;
    const txId = String(body?.transactionId ?? "");
    const event = String(body?.event ?? ""); // "transaction.success" | "transaction.failed"
    const isPaymentSucces = body?.isPaymentSucces === true; // orthographe officielle
    const amount = Number(body?.amount ?? 0);
    const method = String(body?.method ?? "");
    const partnerId = String(body?.partnerId ?? "");
    const performedAt = body?.performedAt
      ? new Date(body.performedAt)
      : new Date();

    // Vérification serveur KKiaPay (best effort)
    let verification: any = null;
    try {
      if (txId) {
        const k = makeKkiapayClient();
        verification = await k.verify(txId).catch(() => null);
      }
    } catch (e) {
      console.error("verify() error", e);
    }

    const status =
      isPaymentSucces || verification?.status === "SUCCESS"
        ? "success"
        : event === "transaction.failed"
        ? "failed"
        : "pending";

    const docId = txId || `evt_${Date.now()}`;
    await db
      .collection("payments")
      .doc(docId)
      .set(
        {
          transactionId: txId || null,
          status,
          amount,
          method,
          partnerId,
          event,
          performedAt: admin.firestore.Timestamp.fromDate(performedAt),
          verification: verification || null,
          source: "webhook",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // KKiaPay attend un 2xx pour valider la réception
    res.status(204).send();
  }
);

/**
 * Callable verifyKkiapay
 * - Re-vérifie le statut d'une transaction et le persiste.
 * - Doit être appelée par l'app après un succès SDK.
 */
export const verifyKkiapay = onCall(
  {
    region: "europe-west1",
    secrets: [KKIA_PUBLIC, KKIA_PRIVATE, KKIA_SECRET, KKIA_SANDBOX],
  },
  async (req) => {
    const txId = String(req.data?.transactionId ?? "");
    if (!txId) {
      throw new Error("transactionId is required");
    }

    const k = makeKkiapayClient();
    const verification = await k.verify(txId);
    const isSuccess =
      verification?.status === "SUCCESS" ||
      verification?.isPaymentSucces === true;

    await db
      .collection("payments")
      .doc(txId)
      .set(
        {
          transactionId: txId,
          status: isSuccess ? "success" : "pending",
          verification,
          source: "callable",
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return { ok: true, status: isSuccess ? "success" : "pending" };
  }
);
