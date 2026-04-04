-- In v2 the payment lifecycle ends at credited_to_farmer.
-- M-Pesa cash-out is tracked separately in the withdrawals table.
-- Remove the v1 statuses that are never used on payments.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
    ADD CONSTRAINT payments_status_check
        CHECK (status IN (
            'created',
            'invoice_created',
            'bitcoin_received',
            'credited_to_farmer',
            'failed'
        ));
