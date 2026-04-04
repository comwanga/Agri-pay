-- Fix-3 / Fix-4: add indexes on the two hottest webhook lookup columns.
-- Without these every BTCPay or M-Pesa callback is a full sequential scan.

CREATE INDEX IF NOT EXISTS idx_payments_btcpay_invoice_id
    ON payments(btcpay_invoice_id)
    WHERE btcpay_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_mpesa_request_id
    ON withdrawals(mpesa_request_id)
    WHERE mpesa_request_id IS NOT NULL;
