import 'package:flutter/material.dart';

class SuccessPage extends StatelessWidget {
  final int amount;
  final String transactionId;

  const SuccessPage({super.key, required this.amount, required this.transactionId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Paiement')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle, size: 96),
            const SizedBox(height: 16),
            const Text('Payé', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Montant: $amount XOF'),
            const SizedBox(height: 8),
            Text('Transaction: $transactionId', style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      ),
    );
  }
}
