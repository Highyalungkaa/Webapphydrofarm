export const SLIP_BUCKET = 'equipment-payment-slips';

export function readTransferAccount(value: any) {
  const account = {
    bank_name: typeof value?.bank_name === 'string' ? value.bank_name : '',
    account_name: typeof value?.account_name === 'string' ? value.account_name : '',
    account_number: typeof value?.account_number === 'string' ? value.account_number : '',
    qr_image_url: typeof value?.qr_image_url === 'string' ? value.qr_image_url : '',
  };
  return { ...account, transfer_enabled: !!(account.account_number.trim() || account.qr_image_url.trim()) };
}

export function parseSlipImage(mimeType: string, data: string) {
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('ขนาดรูปภาพต้องไม่เกิน 5 MB');
  const signatures: Record<string, { extension: string; valid: boolean }> = {
    'image/jpeg': { extension: 'jpg', valid: buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 },
    'image/png': { extension: 'png', valid: buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
    'image/webp': { extension: 'webp', valid: buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
  };
  const image = signatures[mimeType];
  if (!image?.valid) throw new Error('กรุณาเลือกรูปภาพ JPEG, PNG หรือ WebP ที่ถูกต้อง');
  return { buffer, extension: image.extension };
}
