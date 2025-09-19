# payment

A new Flutter project.
d7a4cf19c38d45cab6c596b9f86bc92665575c82fab9434e8ccd33a51cf8992a
d7a4cf19c38d45cab6c596b9f86bc92665575c82fab9434e8ccd33a51cf8992a
d7a4cf19c38d45cab6c596b9f86bc92665575c82fab9434e8ccd33a51cf8992a

$uri = "https://europe-west1-my-test-paymentzidanepp.cloudfunctions.net/kkiapayWebhook"
$headers = @{
  "Content-Type"    = "application/json"
  "x-kkiapay-secret" = "d7a4cf19c38d45cab6c596b9f86bc92665575c82fab9434e8ccd33a51cf8992a"
}
$body = @{
  event         = "transaction.success"
  transactionId = "tx_test_123"
  amount        = 1500
  method        = "momo"
  partnerId     = "test-user"
} | ConvertTo-Json

Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body


$uri = "https://europe-west1-payment-80037.cloudfunctions.net/kkiapayWebhook"
$headers = @{
  "Content-Type"     = "application/json"
  "x-kkiapay-secret" = "d7a4cf19c38d45cab6c596b9f86bc92665575c82fab9434e8ccd33a51cf8992a"
}
$body = @{
  event         = "transaction.success"
  transactionId = "tx_test_123"
  amount        = 1500
  method        = "momo"
  partnerId     = "test-user"
} | ConvertTo-Json

Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body


c2811a3222019d25a6ec80e33c147ae761093089