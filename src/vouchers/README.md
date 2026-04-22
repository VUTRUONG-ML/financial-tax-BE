# Logic Specification: Receipt & Payment Voucher Management Module

## 1. Overview
This module is responsible for recording the cash flow transactions of Business Households, including revenue collection, vendor payments, salary payments, and other operational expenses. The system is designed following the **Single Source of Truth (SSOT)** principle: data from the original vouchers will automatically flow into the accounting ledgers (S01, S02, S03, S04) and update the payment status of the related invoices.

## 2. Main Business Flow
The system processes through 4 strict control steps within a single Database Transaction:

### Step 1: Invoice Classification & Constraints (Inbound/Outbound)
The system automatically branches the processing logic based on `VoucherType` and the linked invoice:
- **Receipt Voucher (`RECEIPT`)**: Can only be linked to an Outbound Invoice.
- **Payment Voucher (`PAYMENT`)**: Can be linked to an Inbound Invoice or left empty (for cases like salary payments, operational expenses without invoices).
- **Constraint**: A single voucher is not allowed to point to two different types of invoices at the same time to prevent cash flow tracking conflicts.

### Step 2: Debt Control
For Receipt Vouchers linked to an outbound invoice, the system executes financial logic checks:
- **Status**: Disallows collecting money for invoices that are already fully paid (`isPaid = true`).
- **Limit**: Uses the `Decimal.js` library to check: `New received amount + Previously received amount <= Total invoice value`. If exceeded, the system will block the transaction to avoid "over-collection".

### Step 3: Concurrency Handling for Voucher Code Generation
To ensure the voucher code (e.g., `PT-0426-0001`) is always sequential and unique for each User:
- Utilizes the `SELECT ... FOR UPDATE` (Pessimistic Locking) command to lock the last data row of the User in the current month.
- Completely prevents Race Condition errors when multiple employees create vouchers at the exact same time.

### Step 4: Automatic Accounting & Audit Log
- **Invoice Update**: Uses the database's `increment` operator to add up the `paidAmount`. Automatically switches `isPaid = true` if the remaining debt equals zero.
- **Audit Log**: Records the entire Snapshot (data before and after modification) of the Invoice and Voucher in JSON format to serve post-audit purposes according to the Tax Management Law.

## 3. Technical Specification

### Data Architecture
- **Integrity**: Uses **Prisma Transaction** to ensure Atomicity. If one step fails, the entire process will be Rolled back.
- **Precision**: The `Decimal(18, 4)` data type is applied throughout to eliminate floating-point inaccuracies in accounting computations.

### Common Business Error Codes

| Error Code | Root Cause |
| :--- | :--- |
| `ConflictException` | Mismatch between the voucher type and the linked invoice type. |
| `BadRequestException` | The invoice has been fully paid, or the new received amount exceeds the remaining debt balance. |
| `NotFoundException` | Cannot find the corresponding Invoice code or Receipt/Payment Category. |
| `ForbiddenException` | The user intentionally attempts to intervene in the invoice of a different business household. |

## 4. Notes for Developers & Testers
- When **Deleting** or **Editing** a Receipt/Payment Voucher, the system must perform the reverse subtraction proportionally on `paidAmount` and revert the `isPaid` status on the invoice when appropriate (The logic is identical to creation but mathematically reversed).
- The voucher code will automatically reset its sequence number to `0001` when moving to a new month based on the `startsWith` function in the database query statement.
