# Financial Periods Module

This module is responsible for managing the lifecycle, state transitions, data integrity, and finalization of financial tax periods within the system.

## 1. Lifecycle Management (Initialization & Maintenance)

### `createInitialPeriod` (Onboarding)

- **Trigger:** Executed immediately upon the user's completion of the Onboarding Wizard.
- **Action:** Creates the initial financial period based on the profile setup date (e.g., the current month), ensuring the system is instantly ready for sales operations.

### `ensurePeriodExists` (Auto-pilot)

- **Trigger:** Invoked internally (implicitly) during core operations such as creating Invoices or Vouchers (Receipts/Payments).
- **Logic:** If no financial period exists for the task's execution date (`transaction_date`), it automatically generates a new period with an `OPEN` status.
- **Engineer Guard:** Upon locating or creating the period, this function scans historical records backwards to check for any unclosed preceding periods in order to return a warning flag to the UI.

## 2. Data Integrity (Gatekeeping & Security)

**Task Execution Logic (Invoices/Documents):**

- **Step 1:** Determine the target period for the operation based on the `transaction_at` timestamp.
- **Step 2:** If the target period is `CLOSED`, the operation is strictly blocked (Read-only mode).
- **Step 3:** If the target period is `OPEN` but a preceding period remains unclosed, the operation is allowed to proceed to prevent disruption of actual business activities, but an "Unclosed Previous Period / Outstanding Debt" warning is displayed.

## 3. Period Transition (State Management)

### `closeFinancialPeriod` (Hard-lock / Closing Books)

- **Condition:** Validates the immediately preceding period. If the prior period is not `CLOSED`, the current period cannot be closed.
- **Action:** Captures a snapshot of the cumulative revenue and expenses into the `Tax_Declarations` table and updates the period status to `CLOSED`.

### `openFinancialPeriod` (Reopening Books / Past Periods)

- **Condition 1:** Verifies if any subsequent periods are already `CLOSED`. If true, the action is blocked to prevent data corruption of future cumulative totals.
- **Condition 2:** Reopening is only permitted if the current status is `CLOSED` and taxes have not been paid yet (or requires Admin privileges to reopen a tax-paid period).
- **Action:** Reverts the status to `OPEN` and records the action trace in the `Audit_Logs`.

## 4. Finalization (Obligation Fulfillment)

### `finishedTaxPayment` (Tax Payment Confirmation)

- **Target:** Exclusively applies to `CLOSED` periods, as the tax liability must be finalized beforehand.
- **Logic:** Updates the `actual_payment_date` and halts the calculation of late payment penalties.
