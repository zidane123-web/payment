import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:kkiapay_flutter_sdk/kkiapay_flutter_sdk.dart';
import 'success_page.dart';

class PaymentPage extends StatefulWidget {
  const PaymentPage({super.key});

  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  static const int amountXof = 200; // Montant à débiter (XOF)

  // ✅ PROD: mets ici TA clé publique "Live" de KKiaPay
  static const String kkiapayPublicKey = 'c2811a3222019d25a6ec80e33c147ae761093089';

  // ✅ PROD: false (ne pas laisser true)
  static const bool useSandbox = false;

  // Signature attendue par le SDK: dynamic Function(dynamic, BuildContext)
  void _onKkiapayCallback(dynamic response, BuildContext ctx) async {
    // Cast sécurisé vers Map<String, dynamic>
    final Map<String, dynamic> data = switch (response) {
      Map() => Map<String, dynamic>.from(response as Map),
      _ => <String, dynamic>{},
    };

    final String? status = data['status'] as String?;

    if (status == PAYMENT_CANCELLED) {
      if (mounted) {
        Navigator.of(ctx).pop();
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Paiement annulé')));
      }
      return;
    }

    if (status == PAYMENT_SUCCESS) {
      final int amount =
          (data['requestData'] is Map && (data['requestData'] as Map).containsKey('amount'))
              ? ((data['requestData'] as Map)['amount'] as int? ?? amountXof)
              : amountXof;

      // transactionId peut varier selon la plateforme
      final String txId = (data['transactionId'] ??
              data['transaction_id'] ??
              data['transactionID'] ??
              '')
          .toString();

      // Vérifie côté serveur (Cloud Function) et marque "payé"
      try {
        final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
            .httpsCallable('verifyKkiapay');
        await callable.call(<String, dynamic>{'transactionId': txId});
      } catch (_) {
        // Si ça échoue, le webhook mettra à jour Firestore quand même
      }

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => SuccessPage(amount: amount, transactionId: txId),
        ),
      );
      return;
    }

    if (status == PENDING_PAYMENT) {
      if (mounted) {
        Navigator.of(ctx).pop();
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Paiement en cours…')));
      }
      return;
    }

    if (mounted) {
      Navigator.of(ctx).maybePop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Statut de paiement: ${status ?? "inconnu"}')),
      );
    }
  }

  void _startPayment() {
    final user = FirebaseAuth.instance.currentUser;
    final kkiapay = KKiaPay(
      amount: amountXof,
      apikey: kkiapayPublicKey,
      sandbox: useSandbox, // ✅ false en production
      partnerId: user?.uid ?? 'guest',
      countries: const ['BJ'],
      paymentMethods: const ['momo', 'card'],
      reason: 'Abonnement / Paiement',
      callback: _onKkiapayCallback,
      theme: '#222F5A',
    );

    if (kIsWeb) {
      KkiapayFlutterSdkPlatform.instance.pay(kkiapay, context, _onKkiapayCallback);
    } else {
      Navigator.push(context, MaterialPageRoute(builder: (context) => kkiapay));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Paiement 1 500 XOF (PROD)')),
      body: Center(
        child: FilledButton(
          onPressed: _startPayment,
          child: const Text('Payer 1 500 XOF'),
        ),
      ),
    );
  }
}
