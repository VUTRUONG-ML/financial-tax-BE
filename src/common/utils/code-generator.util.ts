export function generateMonthlySequenceCode(
  prefix: string,
  lastCode?: string,
): string {
  const transactionDate = new Date();
  const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
  const yy = transactionDate.getFullYear().toString().slice(-2);
  const mmyy = `${mm}${yy}`;

  let nextNumber = 1;
  if (lastCode) {
    const parts = lastCode.split('-');
    // Code format is PREFIX-MMYY-XXXX
    if (parts.length === 3 && parts[1] === mmyy) {
      nextNumber = parseInt(parts[2], 10) + 1;
    }
  }

  const seq = nextNumber.toString().padStart(4, '0');
  return `${prefix}-${mmyy}-${seq}`;
}
