import { onRequest, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { kkiapay as kkiapayServer } from "@kkiapay-org/nodejs-sdk";

// --- Secrets stockés via CLI : voir commandes ci-dessous ---
const KKIA_PUBLIC = defineSecret("KKIA_PUBLIC_KEY");
const KKIA_PRIVATE = defineSecret("KKIA_PRIVATE_KEY");
const KKIA_SECRET  = defineSecret("KKIA_SECRET_KEY");
const KKIA_WEBHOOK_SECRET = defineSecret("KKIA_WEBHOOK_SECRET"); // le secret défini dans le dashboard Webhook

admin.initializeApp();
const db = admin.firestore();

// Helper: client KKiaPay serveur
function makeKkiapayClient() {
  return kkiapayServer({
    publickey: KKIA_PUBLIC.value(),
    privatekey: KKIA_PRIVATE.value(),
    secretkey:  KKIA_SECRET.value(),
    sandbox: true // mets false en prod
  });
}

// 1) Webhook de KKiaPay (Dashboard → Webhook)
export const kkiapayWebhook = onRequest(
  { secrets: [KKIA_PUBLIC, KKIA_PRIVATE, KKIA_SECRET, KKIA_WEBHOOK_SECRET], region: "europe-west1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Vérif du secret reçu (x-kkiapay-secret)
    const headerSecret = req.header("x-kkiapay-secret");
    if (!headerSecret || headerSecret !== KKIA_WEBHOOK_SECRET.value()) {
      res.status(401).send("Invalid signature");
      return;
    }

    try {
      const body = req.body as any;
      const txId = String(body?.transactionId ?? "");
      const event = String(body?.event ?? "");
      const partnerId = String(body?.partnerId ?? "");
      const amount = Number(body?.amount ?? 0);
      const method = String(body?.method ?? "");
      const performedAt = body?.performedAt ? new Date(body.performedAt) : new Date();

      // Double-check serveur → KKiaPay
      const k = makeKkiapayClient();
      let verification: any = null;
      if (txId) {
        verification = await k.verify(txId).catch(() => null);
      }

      const status = event === "transaction.success" ? "success" :
                     event === "transaction.failed"  ? "failed"  : "unknown";

      // Sauvegarde Firestore
      const docId = txId || `evt_${Date.now()}`;
      await db.collection("payments").doc(docId).set({
        status,
        amount,
        method,
        partnerId,
        transactionId: txId || null,
        performedAt: admin.firestore.Timestamp.fromDate(performedAt),
        verification: verification || null,
        source: "webhook"
      }, { merge: true });

      res.status(200).send({ ok: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).send({ ok: false, error: e?.message || "server_error" });
    }
  }
);

// 2) Callable pour vérif manuelle depuis l’app
export const verifyKkiapay = onCall(
  { secrets: [KKIA_PUBLIC, KKIA_PRIVATE, KKIA_SECRET], region: "europe-west1" },
  async (req) => {
    const txId = String((req.data?.transactionId ?? "")).trim();
    if (!txId) {
      throw new Error("transactionId is required");
    }
    const k = makeKkiapayClient();
    const verification = await k.verify(txId);

    // Si la vérif confirme succès, on marque payé
    const isSuccess = (verification?.isPaymentSucces === true) || (verification?.status === "SUCCESS");
    await db.collection("payments").doc(txId).set({
      status: isSuccess ? "success" : "pending",
      transactionId: txId,
      verification,
      source: "callable",
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, status: isSuccess ? "success" : "pending" };
  }
);
