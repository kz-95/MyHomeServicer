# Invoice & Receipt Spec — Malaysia

> Source of truth for invoice and receipt generation.
> Date: 2026-05-27

---

## 1. Standard Invoice — Required Fields

Expected for accounting, audits, SST, and business records.

| Section | Fields |
|---------|--------|
| **Seller Info** | Company / business name, SSM registration number, business address, phone/email, Tax Identification Number (TIN), SST registration number (if SST-registered) |
| **Invoice Info** | Invoice number (unique & sequential), invoice date, due date |
| **Buyer Info** | Customer/company name, customer address, customer TIN / registration number (for B2B / e-Invoice) |
| **Items** | Product/service description, quantity, unit price, discount, subtotal |
| **Tax** | SST / GST tax rate, tax amount |
| **Totals** | Total before tax, total tax, grand total |
| **Payment** | Payment method, bank account / payment terms |
| **Optional** | PO number, remarks, signature/stamp |

---

## 2. Standard Receipt — Required Fields

Receipts are simpler than invoices.

| Section | Fields |
|---------|--------|
| **Receipt Info** | Receipt number, receipt date |
| **Seller Info** | Business/company name |
| **Buyer Info** | Customer name (optional for retail) |
| **Payment Info** | Amount paid, payment method, reference/transaction ID |
| **Description** | What was paid for |
| **Status** | "PAID" / "Payment Received" |

---

## 3. Invoice vs Receipt

| Attribute | Invoice | Receipt |
|-----------|---------|---------|
| Purpose | Requests payment | Confirms payment received |
| Timing | Issued before payment | Issued after payment |
| Key field | Due date | Payment confirmation |
| Accounting | Accounts receivable | Proof of payment |

---

## 4. Malaysia e-Invoice (LHDN / MyInvois) — Mandatory Additions

If the business falls under the e-Invoice rollout, LHDN requires these additional structured fields.

| Category | Mandatory Fields |
|----------|-----------------|
| **Supplier** | Legal name, TIN, BRN/SSM number, MSIC code |
| **Buyer** | Buyer TIN, ID/passport/BRN |
| **Invoice Metadata** | Invoice type code, currency, timestamp, validation ID |
| **Items** | Detailed line items |
| **Tax** | Tax type code, tax exemption reason |
| **Validation** | LHDN Unique Identifier (UIN), QR code |
| **Technical** | XML / JSON structure |

---

## 5. Mapping to MyServicer Data Model

| Invoice Spec Field | MyServicer Source |
|--------------------|-------------------|
| Company name | `Servicer.businessName` |
| SSM registration number | `Servicer.businessRegistrationNumber` |
| Business address | Servicer address (from Servicer profile or settings) |
| TIN | `Servicer.taxNumber` |
| SST registration number | `Servicer.sstNumber` (when `sstRegistered = true`) |
| Invoice number | `Invoice.invoiceNumber` (existing sequential) |
| Invoice date | `Invoice.issuedAt` |
| Due date | To add: `Invoice.dueDate` field |
| Customer name | `User.name` (booking customer) |
| Customer address | `UserAddress` (booking address) |
| Line items | `Invoice.lineItems` (JSON snapshot) |
| Subtotal | `Invoice.subtotal` |
| Discount | `Invoice.promoDiscount` |
| Tax rate | `Invoice.taxRate` (SST rate from platform settings) |
| Tax amount | `Invoice.taxAmount` |
| Grand total | `Invoice.total` |
| Platform fee | `Invoice.platformFee` |
| Payment method | `Booking.settlementMethod` (gateway / credit / cash) |
| Payment reference | Stripe PaymentIntent ID or transaction ID |
| Status | "PAID" when `Invoice.paidAt` is set |

---

## 6. Open Items (not yet in model)

| Item | Action |
|------|--------|
| `Invoice.dueDate` | Add to schema if not present |
| Servicer business address | Need servicer address field or use service areas |
| Customer TIN | Optional — add `User.taxNumber`? (POST-MVP) |
| LHDN e-Invoice fields | POST-MVP — MSIC code, invoice type code, UIN, QR code |
| Seller bank account | Need `Servicer.bankName` / `Servicer.bankAccount` fields |
