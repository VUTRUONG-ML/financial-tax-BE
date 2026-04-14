# Module A: Initial Setup & Tax Configuration (Onboarding Domain)

## 1. Business Overview

This domain is responsible for initializing and updating tax configurations (industry group, revenue threshold) for sole proprietorships. The data here is the source (Single Source of Truth) for Module D (Tax Engine) to calculate taxes.

## 2. Core Business Rules (Implemented)

### API: Initial Setup (`setupTaxConfiguration`)

- **Rule 1 (One-time only):** Users are only allowed to configure the system once in their lifetime.
- **Technical:** Use Idempotency Check (`findFirst` -> throws a 409 Conflict) to prevent Replay Attacks.

### API: Update Configuration (`updateTaxConfiguration`)

- **Rule 2 (3-Month Lockdown):** Users are only allowed to update their tax configuration once every 90 days (equivalent to one tax filing quarter).
- **Rule 3 (Automatic System):** When the system detects revenue exceeding the threshold, it is allowed to bypass Rule 2 to force the user to upgrade their account. The audit log will record `actionBy: SYSTEM_AUTO`.
- **Rule 4 (Spam Data Prevention):** If a user submits a payload identical to the active configuration, a 400 BadRequest will be thrown.
- **Rule 5 (Race Condition Prevention):** Prevents users from double-clicking to create two configurations simultaneously.
- **Technique:** Apply Optimistic Locking (`updateMany` with the condition `applyToDate: null`).

## 3. Audit Log

All Status changes (New creation, Old period closure) are logged via the required Transaction (`tx`), saving all Snapshots of the tax rates (`vatRate`, `pitRate`) at the time of configuration.
