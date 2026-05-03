-- Remote DBs created before payout_utr_ref was introduced may lack this column.

alter table public.pay_out_requests
  add column if not exists payout_utr_ref text;

comment on column public.pay_out_requests.payout_utr_ref is
  'UTR / reference entered by admin when approving after sending funds to payee UPI.';

notify pgrst, 'reload schema';
